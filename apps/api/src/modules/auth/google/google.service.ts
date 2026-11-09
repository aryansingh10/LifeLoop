import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { uuidv7 } from '../../../common/ids.js';
import { env } from '../../../config/env.js';
import { InjectDb, type DB } from '../../../database/database.module.js';
import { userIdentities, users, type UserRow } from '../../../database/schema.js';
import { GOOGLE_ISSUERS, GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL } from './google-oauth.js';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
}

export class GoogleAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

@Injectable()
export class GoogleService {
  private readonly logger = new Logger('GoogleAuth');

  constructor(@InjectDb() private readonly db: DB) {}

  get enabled(): boolean {
    return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
  }

  get redirectUri(): string {
    return env().GOOGLE_REDIRECT_URI ?? `${env().APP_URL}/api/auth/google/callback`;
  }

  /** Exchanges the authorization code (with the PKCE verifier) and verifies the ID token. */
  async exchange(code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
    const e = env();
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: e.GOOGLE_CLIENT_ID!,
        client_secret: e.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    if (!res.ok || !body.id_token) {
      this.logger.warn(`token exchange failed: ${body.error ?? res.status} ${body.error_description ?? ''}`);
      throw new GoogleAuthError('EXCHANGE_FAILED', 'Google sign-in failed');
    }

    // Verify signature (Google's published keys), issuer, audience and expiry.
    const { payload } = await jwtVerify(body.id_token, jwks, { issuer: GOOGLE_ISSUERS, audience: e.GOOGLE_CLIENT_ID! }).catch(() => {
      throw new GoogleAuthError('INVALID_TOKEN', 'Google sign-in could not be verified');
    });
    if (payload.nonce !== nonce) throw new GoogleAuthError('INVALID_TOKEN', 'Google sign-in could not be verified');
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new GoogleAuthError('INVALID_TOKEN', 'Missing account details');
    if (payload.email_verified !== true) throw new GoogleAuthError('EMAIL_NOT_VERIFIED', 'Your Google email address is not verified');
    return { sub: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : null };
  }

  async identityOwner(sub: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'GOOGLE'), eq(userIdentities.providerSubject, sub)))
      .limit(1);
    return row?.userId ?? null;
  }

  async userByEmail(email: string): Promise<UserRow | null> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return u ?? null;
  }

  async isLinked(userId: string): Promise<{ email: string } | null> {
    const [row] = await this.db
      .select({ email: userIdentities.emailAtLink })
      .from(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, 'GOOGLE')))
      .limit(1);
    return row ?? null;
  }

  /** Links a Google account to a user. Marks the email verified when it matches the account email. */
  async link(userId: string, profile: GoogleProfile): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(userIdentities)
        .ignore()
        .values({ id: uuidv7(), userId, provider: 'GOOGLE', providerSubject: profile.sub, emailAtLink: profile.email });
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (u && !u.emailVerifiedAt && u.email === profile.email) {
        await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      }
    });
  }

  async createUser(profile: GoogleProfile): Promise<string> {
    const id = uuidv7();
    const displayName = (profile.name?.trim() || profile.email.split('@')[0]).slice(0, 100);
    await this.db.transaction(async (tx) => {
      await tx.insert(users).values({ id, email: profile.email, passwordHash: null, displayName, emailVerifiedAt: new Date() });
      await tx.insert(userIdentities).values({ id: uuidv7(), userId: id, provider: 'GOOGLE', providerSubject: profile.sub, emailAtLink: profile.email });
    });
    return id;
  }

  /**
   * The real owner of an UNVERIFIED account (who just proved the email via Google) takes it over:
   * any password set by someone else stops working, every existing session is signed out,
   * the email is marked verified and Google is linked. Returns the instant sessions became invalid.
   */
  async claim(userId: string, profile: GoogleProfile): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!u || u.email !== profile.email) throw new GoogleAuthError('CLAIM_FAILED', 'This account cannot be claimed');
      if (u.emailVerifiedAt) throw new GoogleAuthError('CLAIM_FAILED', 'This account is already verified; log in with its password');
      const now = new Date();
      await tx.update(users).set({ passwordHash: null, emailVerifiedAt: now, sessionsValidAfter: now }).where(eq(users.id, userId));
      await tx
        .insert(userIdentities)
        .ignore()
        .values({ id: uuidv7(), userId, provider: 'GOOGLE', providerSubject: profile.sub, emailAtLink: profile.email });
    });
  }

  async unlink(userId: string): Promise<void> {
    const [u] = await this.db.select({ hasPassword: users.passwordHash }).from(users).where(eq(users.id, userId));
    if (!u?.hasPassword) throw new GoogleAuthError('LAST_LOGIN_METHOD', 'Google is your only way to sign in, so it cannot be disconnected yet');
    await this.db.delete(userIdentities).where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, 'GOOGLE')));
  }
}
