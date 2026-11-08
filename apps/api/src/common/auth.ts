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
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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
  return jwt.sign({}, env().JWT_SECRET, { subject: userId, expiresIn: SESSION_TTL_SECONDS, algorithm: 'HS256' });
}

export function verifySession(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env().JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'object' && typeof payload.sub === 'string') return { id: payload.sub };
    return null;
  } catch {
    return null;
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
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = requestFrom(context);
    const token: string | undefined = req?.cookies?.[SESSION_COOKIE];
    const user = token ? verifySession(token) : null;
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
