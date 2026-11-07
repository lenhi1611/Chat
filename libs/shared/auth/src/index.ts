// Public API of @realtime-chat/auth: provider, actions, selectors, guards.
// The token lives in the store; the refresher and API service stay internal.
export { provideAuth } from './lib/provide-auth';
export type { AuthConfig } from './lib/auth.config';
export { AuthActions } from './lib/auth.actions';
export {
  selectAccessToken,
  selectAuthError,
  selectAuthPending,
  selectAuthStatus,
  selectCurrentUser,
  selectIsAuthenticated,
} from './lib/auth.feature';
export { authGuard, guestGuard } from './lib/auth.guards';
export { authInterceptor } from './lib/auth.interceptor';
export { safeReturnUrl } from './lib/return-url';
export type {
  AuthError,
  AuthStatus,
  CurrentUser,
  SessionEndReason,
} from './lib/auth.models';
