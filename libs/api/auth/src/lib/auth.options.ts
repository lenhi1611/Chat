/** Settings of the auth domain, provided by the app that imports AuthModule. */
export interface AuthModuleOptions {
  /** auth_db connection string. */
  databaseUrl: string;
  /** HS256 key for access tokens (at least 32 characters). */
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  /** A rotated refresh token reused within this window is not treated as theft. */
  refreshReuseGraceSeconds: number;
  wsTicketTtlSeconds: number;
}

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');
