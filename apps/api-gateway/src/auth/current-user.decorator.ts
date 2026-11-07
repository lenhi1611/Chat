import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The caller of an authenticated request (set by AccessTokenGuard). */
export interface AuthenticatedUser {
  userId: string;
  /** Login session id (refresh-token family). */
  sid: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedUser;
}

/** `@CurrentUser() user: AuthenticatedUser` in a guarded route. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) {
      // Only reachable if a @Public() route asks for the user: a bug.
      throw new Error('@CurrentUser() used on a route without authentication');
    }
    return auth;
  },
);
