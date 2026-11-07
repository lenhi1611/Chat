import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '@realtime-chat/contracts';
import type { AuthError, SessionEndReason } from './auth.models';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    Register: props<{ request: RegisterRequest }>(),
    Login: props<{ request: LoginRequest }>(),
    /** Register or login was rejected (shown on the form). */
    'Request Failed': props<{ error: AuthError }>(),
    /** Ask for a new access token with the refresh cookie. */
    Refresh: emptyProps(),
    Logout: emptyProps(),
    /** A fresh access token (login, register or refresh). */
    'Session Established': props<{ response: AuthResponse }>(),
    /** Login or register succeeded (after sessionEstablished): leave the form. */
    'Signed In': emptyProps(),
    /** No session any more: forget the token and the user. */
    'Session Ended': props<{ reason: SessionEndReason }>(),
    'Error Cleared': emptyProps(),
  },
});
