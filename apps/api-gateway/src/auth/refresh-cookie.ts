import { REFRESH_COOKIE } from '@realtime-chat/contracts';
import type { CookieOptions, Request, Response } from 'express';

/**
 * The refresh token lives only in this cookie: httpOnly (no JavaScript
 * access), SameSite=Strict (not sent on cross-site requests) and scoped to
 * /api/auth (not sent to the rest of the API). `Secure` behind HTTPS.
 */
export function refreshCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE.path,
    secure,
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  response.cookie(REFRESH_COOKIE.name, token, {
    ...refreshCookieOptions(secure),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE.name, refreshCookieOptions(secure));
}

export function readRefreshCookie(request: Request): string | undefined {
  const value: unknown = request.cookies?.[REFRESH_COOKIE.name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
