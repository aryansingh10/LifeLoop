import { createHash } from 'node:crypto';
import { buildAuthUrl, decide, newOAuthState, pkceChallenge, safeEqual } from './google-oauth.js';

describe('google oauth helpers', () => {
  it('builds an authorization URL with PKCE, state, nonce and only basic scopes', () => {
    const s = newOAuthState('login', true);
    const url = new URL(buildAuthUrl('client-123', 'http://localhost:3000/api/auth/google/callback', s));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe(s.state);
    expect(url.searchParams.get('nonce')).toBe(s.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(s.verifier).digest('base64url'));
    expect(url.searchParams.get('code_challenge')).not.toBe(s.verifier); // verifier never leaves the server
  });

  it('generates unique, unguessable state values', () => {
    const a = newOAuthState('login', false);
    const b = newOAuthState('login', false);
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(40);
    expect(pkceChallenge('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });

  it('compares state in constant time and rejects mismatches', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('account linking rules', () => {
  const base = { mode: 'login' as const, identityUserId: null, emailUser: null, sessionUserId: null, ageConfirmed: true };

  it('logs in when the Google account is already linked', () => {
    expect(decide({ ...base, identityUserId: 'u1' })).toEqual({ action: 'LOGIN', userId: 'u1' });
  });

  it('creates a new account for a new Google user who confirmed age', () => {
    expect(decide(base)).toEqual({ action: 'CREATE' });
  });

  it('asks a brand-new Google user to confirm they are 18+', () => {
    expect(decide({ ...base, ageConfirmed: false })).toEqual({ action: 'NEEDS_AGE' });
  });

  it('never silently takes over an unverified password account with the same email', () => {
    expect(decide({ ...base, emailUser: { id: 'u2', hasPassword: true, emailVerified: false } })).toEqual({ action: 'NEEDS_PASSWORD_TO_LINK', userId: 'u2' });
  });

  it('links automatically when the existing account email is verified', () => {
    expect(decide({ ...base, emailUser: { id: 'u2', hasPassword: true, emailVerified: true } })).toEqual({ action: 'LINK_AND_LOGIN', userId: 'u2' });
  });

  it('links from settings when logged in', () => {
    expect(decide({ ...base, mode: 'link', sessionUserId: 'u3' })).toEqual({ action: 'LINK', userId: 'u3' });
  });

  it('refuses to link a Google account that belongs to someone else', () => {
    expect(decide({ ...base, mode: 'link', sessionUserId: 'u3', identityUserId: 'u9' })).toEqual({ action: 'ERROR', code: 'GOOGLE_USED_BY_OTHER' });
    expect(decide({ ...base, mode: 'link', sessionUserId: 'u3', emailUser: { id: 'u9', hasPassword: true, emailVerified: true } })).toEqual({
      action: 'ERROR',
      code: 'EMAIL_BELONGS_TO_OTHER',
    });
  });

  it('requires a session to link', () => {
    expect(decide({ ...base, mode: 'link' })).toEqual({ action: 'ERROR', code: 'NOT_LOGGED_IN' });
  });
});
