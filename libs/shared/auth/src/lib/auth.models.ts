import type {
  ApiErrorCode,
  CurrentUser,
  ValidationIssue,
} from '@realtime-chat/contracts';

/**
 * - `unknown`: before the startup silent refresh has answered (guards wait)
 * - `anonymous`: no session (never signed in, signed out, or it expired)
 * - `authenticated`: an access token is in memory
 */
export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Error shown on the auth forms: an API error, or the server being unreachable. */
export interface AuthError {
  code: ApiErrorCode | 'NETWORK_ERROR';
  message: string;
  details?: ValidationIssue[];
}

/** Why a session ended (for UI and logs). */
export type SessionEndReason =
  'no-session' | 'signed-out' | 'refresh-failed' | 'revoked';

export type { CurrentUser };
