import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from './auth.js';

const secure = () => env().NODE_ENV === 'production';

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

/**
 * Short-lived, signed, httpOnly cookie for multi-step auth flows (OAuth state, pending account link).
 * `purpose` is bound into the token so one kind can't be replayed as another.
 */
export function setSignedCookie(res: Response, name: string, purpose: string, payload: object, path: string, ttlSeconds = 600) {
  const token = jwt.sign({ ...payload }, env().JWT_SECRET, { audience: purpose, expiresIn: ttlSeconds, algorithm: 'HS256' });
  res.cookie(name, token, { httpOnly: true, sameSite: 'lax', secure: secure(), path, maxAge: ttlSeconds * 1000 });
}

export function readSignedCookie<T>(token: string | undefined, purpose: string): T | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env().JWT_SECRET, { audience: purpose, algorithms: ['HS256'] }) as T;
  } catch {
    return null;
  }
}
