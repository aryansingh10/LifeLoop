import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Pure helpers for Google sign-in (OpenID Connect, authorization code flow with PKCE). */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
/** Only basic profile. LifeLoop never asks for Gmail access here. */
export const GOOGLE_SCOPES = 'openid email profile';

const b64url = (buf: Buffer) => buf.toString('base64url');
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest());

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  mode: 'login' | 'link';
  ageConfirmed: boolean;
}

export function newOAuthState(mode: 'login' | 'link', ageConfirmed: boolean): OAuthState {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(48), mode, ageConfirmed };
}

export function buildAuthUrl(clientId: string, redirectUri: string, s: OAuthState): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state: s.state,
    nonce: s.nonce,
    code_challenge: pkceChallenge(s.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'online',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** What to do after Google confirmed who the person is. */
export type GoogleDecision =
  | { action: 'LOGIN'; userId: string }
  | { action: 'LINK_AND_LOGIN'; userId: string }
  | { action: 'CREATE' }
  | { action: 'LINK'; userId: string }
  | { action: 'ALREADY_LINKED'; userId: string }
  | { action: 'NEEDS_PASSWORD_TO_LINK'; userId: string }
  | { action: 'NEEDS_AGE' }
  | { action: 'ERROR'; code: 'NOT_LOGGED_IN' | 'GOOGLE_USED_BY_OTHER' | 'EMAIL_BELONGS_TO_OTHER' | 'ACCOUNT_CONFLICT' };

export interface DecisionInput {
  mode: 'login' | 'link';
  /** LifeLoop user already linked to this Google account, if any. */
  identityUserId: string | null;
  /** LifeLoop user registered with the same email, if any. */
  emailUser: { id: string; hasPassword: boolean; emailVerified: boolean } | null;
  /** Currently logged-in user (link mode). */
  sessionUserId: string | null;
  ageConfirmed: boolean;
}

/**
 * Account-linking rules.
 * - Same email, account email already VERIFIED: the person who controls the inbox created it, and
 *   Google just proved they control that inbox -> link automatically.
 * - Same email, NOT verified: someone may have pre-registered this email with their own password
 *   ("pre-account takeover"). The owner must enter the password once, or claim the account via
 *   Google, which removes that password and signs out every other session.
 * - New Google users confirm they are 18+ on one screen after Google (Google does not share age).
 */
export function decide(i: DecisionInput): GoogleDecision {
  if (i.mode === 'link') {
    if (!i.sessionUserId) return { action: 'ERROR', code: 'NOT_LOGGED_IN' };
    if (i.identityUserId && i.identityUserId !== i.sessionUserId) return { action: 'ERROR', code: 'GOOGLE_USED_BY_OTHER' };
    if (i.identityUserId === i.sessionUserId) return { action: 'ALREADY_LINKED', userId: i.sessionUserId };
    if (i.emailUser && i.emailUser.id !== i.sessionUserId) return { action: 'ERROR', code: 'EMAIL_BELONGS_TO_OTHER' };
    return { action: 'LINK', userId: i.sessionUserId };
  }
  if (i.identityUserId) return { action: 'LOGIN', userId: i.identityUserId };
  if (i.emailUser) {
    if (i.emailUser.emailVerified) return { action: 'LINK_AND_LOGIN', userId: i.emailUser.id };
    return i.emailUser.hasPassword ? { action: 'NEEDS_PASSWORD_TO_LINK', userId: i.emailUser.id } : { action: 'ERROR', code: 'ACCOUNT_CONFLICT' };
  }
  if (!i.ageConfirmed) return { action: 'NEEDS_AGE' };
  return { action: 'CREATE' };
}
