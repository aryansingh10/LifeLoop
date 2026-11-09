import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { InjectDb, type DB } from '../database/database.module.js';
import { users } from '../database/schema.js';

export const SESSION_COOKIE = 'll_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
}

export interface GqlContext {
  req: Request & { user?: AuthUser };
  res: Response;
}

const IS_PUBLIC = 'isPublic';
/** Marks a route/resolver as reachable without a session. Everything else is denied by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export function signSession(userId: string): string {
  // iatMs: millisecond issue time, so 'sign out everywhere' also covers sessions created moments earlier.
  return jwt.sign({ iatMs: Date.now() }, env().JWT_SECRET, { subject: userId, expiresIn: SESSION_TTL_SECONDS, algorithm: 'HS256' });
}

/** Verifies the signature and expiry only. Use SessionValidator for the full check. */
export function verifySession(token: string): (AuthUser & { issuedAtMs: number }) | null {
  try {
    const payload = jwt.verify(token, env().JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'object' && typeof payload.sub === 'string' && typeof payload.iat === 'number') {
      const issuedAtMs = typeof payload.iatMs === 'number' ? payload.iatMs : payload.iat * 1000;
      return { id: payload.sub, issuedAtMs };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Full session check: valid signature, user still exists, and the session was issued after the
 * user's last "sign out everywhere" (sessions_valid_after).
 */
@Injectable()
export class SessionValidator {
  constructor(@InjectDb() private readonly db: DB) {}

  async validate(token: string | undefined): Promise<AuthUser | null> {
    const s = token ? verifySession(token) : null;
    if (!s) return null;
    const [u] = await this.db.select({ after: users.sessionsValidAfter }).from(users).where(eq(users.id, s.id)).limit(1);
    if (!u) return null;
    if (u.after && s.issuedAtMs <= u.after.getTime()) return null;
    return { id: s.id };
  }
}

function requestFrom(context: ExecutionContext): (Request & { user?: AuthUser }) | undefined {
  if (context.getType<'graphql' | 'http'>() === 'graphql') {
    return GqlExecutionContext.create(context).getContext<GqlContext>().req;
  }
  return context.switchToHttp().getRequest();
}

/** Global guard: default deny; reads the httpOnly session cookie. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = requestFrom(context);
    const token: string | undefined = req?.cookies?.[SESSION_COOKIE];
    const user = await this.sessions.validate(token);
    if (req && user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException('Please log in');
    return true;
  }
}

/** Injects the authenticated user's id. User ids are never taken from client arguments. */
export const CurrentUserId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const req = requestFrom(context);
  if (!req?.user) throw new UnauthorizedException('Please log in');
  return req.user.id;
});
