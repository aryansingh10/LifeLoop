import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, NotFoundException, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { CurrentUserId, Public, SESSION_COOKIE, SessionValidator } from '../../common/auth.js';
import { readSignedCookie, setSessionCookie, setSignedCookie } from '../../common/session.js';
import { z } from 'zod';
import { AuthService, LoginSchema, parseBody, PASSWORD_RULE, RegisterSchema } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';

const ForgotSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email').max(320) });
const ResetSchema = z.object({ token: z.string().min(1).max(200), password: PASSWORD_RULE });
import { EmailVerificationService } from './email-verification.service.js';
import { buildAuthUrl, decide, newOAuthState, safeEqual, type OAuthState } from './google/google-oauth.js';
import { GoogleAuthError, GoogleService, type GoogleProfile } from './google/google.service.js';

/** Tiny fixed-window limiter (single instance). Replace with a shared store when scaling out. */
const hits = new Map<string, { count: number; resetAt: number }>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++h.count > max) throw new HttpException('Too many attempts. Please wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
}

const OAUTH_COOKIE = 'll_oauth';
const OAUTH_PATH = '/api/auth/google';
const LINK_COOKIE = 'll_pending_link';
const LINK_PATH = '/api/auth';
const SIGNUP_COOKIE = 'll_pending_signup';

interface PendingLink {
  userId: string;
  profile: GoogleProfile;
}

const publicUser = (u: { id: string; email: string; displayName: string; timezone: string }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  timezone: u.timezone,
});

@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    private readonly verification: EmailVerificationService,
    private readonly sessions: SessionValidator,
    private readonly passwords: PasswordResetService,
  ) {}

  /** Which sign-in methods are configured (lets the UI hide the Google button when not set up). */
  @Public()
  @Get('providers')
  providers() {
    return { google: this.google.enabled };
  }

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    limit(`register:${req.ip}`, 10, 60 * 60 * 1000);
    const user = await this.auth.register(parseBody(RegisterSchema, body));
    setSessionCookie(res, user.id);
    await this.verification.send(user.id);
    return { user: publicUser(user) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(LoginSchema, body);
    limit(`login-ip:${req.ip}`, 20, 60 * 1000);
    limit(`login-email:${input.email}`, 10, 15 * 60 * 1000);
    const user = await this.auth.login(input);
    setSessionCookie(res, user.id);

    // Finish a Google link that was waiting for proof of password ownership.
    let linkedGoogle = false;
    const pending = readSignedCookie<PendingLink>(req.cookies?.[LINK_COOKIE], 'google-link');
    if (pending && pending.userId === user.id) {
      await this.google.link(user.id, pending.profile);
      linkedGoogle = true;
    }
    if (req.cookies?.[LINK_COOKIE]) res.clearCookie(LINK_COOKIE, { path: LINK_PATH });
    return { user: publicUser(user), linkedGoogle };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  // ------------------------------------------------------------------ Google sign-in

  /** Starts Google sign-in. ?mode=link connects Google to the logged-in account; ?age=1 confirms 18+. */
  @Public()
  @Get('google/start')
  googleStart(@Query('mode') mode: string | undefined, @Query('age') age: string | undefined, @Req() req: Request, @Res() res: Response) {
    const app = env().APP_URL;
    if (!this.google.enabled) return res.redirect(`${app}/login?error=google_not_configured`);
    limit(`google-start:${req.ip}`, 30, 60 * 1000);
    const state = newOAuthState(mode === 'link' ? 'link' : 'login', age === '1');
    setSignedCookie(res, OAUTH_COOKIE, 'google-oauth', state, OAUTH_PATH, 600);
    return res.redirect(buildAuthUrl(env().GOOGLE_CLIENT_ID!, this.google.redirectUri, state));
  }

  @Public()
  @Get('google/callback')
  async googleCallback(@Query() q: Record<string, string | undefined>, @Req() req: Request, @Res() res: Response) {
    const app = env().APP_URL;
    const fail = (code: string, mode: 'login' | 'link' = 'login') =>
      res.redirect(mode === 'link' ? `${app}/settings?google=${code}` : `${app}/login?error=${code}`);

    const saved = readSignedCookie<OAuthState>(req.cookies?.[OAUTH_COOKIE], 'google-oauth');
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_PATH });
    if (!saved) return fail('google_expired');
    if (q.error) return fail(q.error === 'access_denied' ? 'google_cancelled' : 'google_failed', saved.mode);
    if (!q.code || !q.state || !safeEqual(q.state, saved.state)) return fail('google_failed', saved.mode);

    let profile: GoogleProfile;
    try {
      profile = await this.google.exchange(q.code, saved.verifier, saved.nonce);
    } catch (err) {
      const code = err instanceof GoogleAuthError && err.code === 'EMAIL_NOT_VERIFIED' ? 'google_unverified' : 'google_failed';
      this.logger.warn(`Google callback failed: ${(err as Error).message}`);
      return fail(code, saved.mode);
    }

    const session = await this.sessions.validate(req.cookies?.[SESSION_COOKIE]);
    const emailUser = await this.google.userByEmail(profile.email);
    const decision = decide({
      mode: saved.mode,
      identityUserId: await this.google.identityOwner(profile.sub),
      emailUser: emailUser ? { id: emailUser.id, hasPassword: Boolean(emailUser.passwordHash), emailVerified: Boolean(emailUser.emailVerifiedAt) } : null,
      sessionUserId: session?.id ?? null,
      ageConfirmed: saved.ageConfirmed,
    });

    switch (decision.action) {
      case 'LOGIN':
        setSessionCookie(res, decision.userId);
        return res.redirect(`${app}/dashboard`);
      case 'LINK_AND_LOGIN':
        await this.google.link(decision.userId, profile);
        setSessionCookie(res, decision.userId);
        return res.redirect(`${app}/dashboard?google=linked`);
      case 'CREATE': {
        const userId = await this.google.createUser(profile);
        setSessionCookie(res, userId);
        return res.redirect(`${app}/dashboard?welcome=1`);
      }
      case 'LINK':
        await this.google.link(decision.userId, profile);
        return res.redirect(`${app}/settings?google=linked`);
      case 'ALREADY_LINKED':
        return res.redirect(`${app}/settings?google=linked`);
      case 'NEEDS_PASSWORD_TO_LINK':
        setSignedCookie(res, LINK_COOKIE, 'google-link', { userId: decision.userId, profile } satisfies PendingLink, LINK_PATH, 600);
        return res.redirect(`${app}/login?link=google&email=${encodeURIComponent(profile.email)}`);
      case 'NEEDS_AGE':
        // One confirmation screen instead of a second trip through Google.
        setSignedCookie(res, SIGNUP_COOKIE, 'google-signup', { profile }, OAUTH_PATH, 600);
        return res.redirect(`${app}/welcome`);
      case 'ERROR':
        return fail(decision.code.toLowerCase(), saved.mode);
    }
  }

  /** Details for the one-step "confirm you're 18+" screen after Google. */
  @Public()
  @Get('google/pending-signup')
  pendingSignup(@Req() req: Request) {
    const p = readSignedCookie<{ profile: GoogleProfile }>(req.cookies?.[SIGNUP_COOKIE], 'google-signup');
    if (!p) throw new NotFoundException('No Google sign-up in progress');
    return { name: p.profile.name, email: p.profile.email };
  }

  @Public()
  @Post('google/complete-signup')
  @HttpCode(200)
  async completeSignup(@Body() body: { ageConfirmed?: unknown }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const p = readSignedCookie<{ profile: GoogleProfile }>(req.cookies?.[SIGNUP_COOKIE], 'google-signup');
    if (!p) throw new NotFoundException('Your Google sign-up expired. Please continue with Google again.');
    if (body?.ageConfirmed !== true) throw new BadRequestException('You must be 18 or older to use LifeLoop');
    // Re-check: the account may have been created meanwhile (e.g. second tab).
    const existing = (await this.google.identityOwner(p.profile.sub)) ?? (await this.google.userByEmail(p.profile.email))?.id;
    if (existing) throw new BadRequestException('An account already exists. Please log in.');
    const userId = await this.google.createUser(p.profile);
    res.clearCookie(SIGNUP_COOKIE, { path: OAUTH_PATH });
    setSessionCookie(res, userId);
    return { ok: true };
  }

  /**
   * For an unverified account whose password the Google user doesn't know: Google already proved
   * they own the email, so they take the account over. Removes the old password and signs out
   * every other session (defeats an account someone pre-registered with this email).
   */
  @Public()
  @Post('google/claim')
  @HttpCode(200)
  async claim(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const pending = readSignedCookie<PendingLink>(req.cookies?.[LINK_COOKIE], 'google-link');
    if (!pending) throw new NotFoundException('This link expired. Please continue with Google again.');
    try {
      await this.google.claim(pending.userId, pending.profile);
    } catch (err) {
      if (err instanceof GoogleAuthError) throw new BadRequestException(err.message);
      throw err;
    }
    res.clearCookie(LINK_COOKIE, { path: LINK_PATH });
    setSessionCookie(res, pending.userId);
    return { ok: true };
  }

  // ------------------------------------------------------------------ forgot / add password

  /** Always answers the same way, so it can't be used to discover which emails have accounts. */
  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const { email } = parseBody(ForgotSchema, body);
    limit(`forgot-ip:${req.ip}`, 10, 15 * 60 * 1000);
    limit(`forgot-email:${email}`, 3, 60 * 60 * 1000);
    await this.passwords.request(email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    limit(`reset-ip:${req.ip}`, 20, 15 * 60 * 1000);
    const { token, password } = parseBody(ResetSchema, body);
    const userId = await this.passwords.reset(token, password);
    if (!userId) throw new BadRequestException('This link is invalid, already used, or expired. Please request a new one.');
    // Every other session was signed out; this browser gets a fresh one.
    setSessionCookie(res, userId);
    return { ok: true };
  }

  // ------------------------------------------------------------------ email verification

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: { token?: unknown }, @Req() req: Request) {
    limit(`verify:${req.ip}`, 20, 15 * 60 * 1000);
    const userId = typeof body?.token === 'string' ? await this.verification.verify(body.token) : null;
    if (!userId) throw new BadRequestException('This verification link is invalid, already used, or expired.');
    return { ok: true };
  }

  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(@CurrentUserId() userId: string) {
    limit(`resend:${userId}`, 3, 60 * 60 * 1000);
    await this.verification.send(userId);
    return { ok: true };
  }
}
