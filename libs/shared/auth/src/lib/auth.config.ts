import { InjectionToken } from '@angular/core';

export interface AuthConfig {
  /** e.g. `http://localhost:3000/api`; only requests under it get a token. */
  apiBaseUrl: string;
  /** Where guests are sent (default `/auth/login`). */
  loginPath?: string;
  /** Where signed-in users go without a returnUrl (default `/chat`). */
  defaultAuthenticatedPath?: string;
}

export const AUTH_CONFIG = new InjectionToken<Required<AuthConfig>>(
  'AUTH_CONFIG',
);

export const withAuthDefaults = (config: AuthConfig): Required<AuthConfig> => ({
  loginPath: '/auth/login',
  defaultAuthenticatedPath: '/chat',
  ...config,
  apiBaseUrl: config.apiBaseUrl.replace(/\/+$/, ''),
});
