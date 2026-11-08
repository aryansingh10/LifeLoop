import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { Public, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '../../common/auth.js';
import { AuthService, LoginSchema, parseBody, RegisterSchema } from './auth.service.js';

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

function setSession(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

const publicUser = (u: { id: string; email: string; displayName: string; timezone: string }) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  timezone: u.timezone,
});

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    limit(`register:${req.ip}`, 10, 60 * 60 * 1000);
    const user = await this.auth.register(parseBody(RegisterSchema, body));
    setSession(res, user.id);
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
    setSession(res, user.id);
    return { user: publicUser(user) };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }
}
