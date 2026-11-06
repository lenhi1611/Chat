import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import { AuthActions } from './auth.actions';
import type { AuthError, AuthStatus, CurrentUser } from './auth.models';

export interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  /** In memory only: never written to localStorage or a cookie. */
  accessToken: string | null;
  /** A register/login request is in flight. */
  pending: boolean;
  error: AuthError | null;
}

export const initialAuthState: AuthState = {
  status: 'unknown',
  user: null,
  accessToken: null,
  pending: false,
  error: null,
};

export const authFeature = createFeature({
  name: 'auth',
  reducer: createReducer(
    initialAuthState,
    on(AuthActions.register, AuthActions.login, (state) => ({
      ...state,
      pending: true,
      error: null,
    })),
    on(AuthActions.requestFailed, (state, { error }) => ({
      ...state,
      pending: false,
      error,
    })),
    on(AuthActions.sessionEstablished, (state, { response }) => ({
      ...state,
      status: 'authenticated' as const,
      user: response.user,
      accessToken: response.accessToken,
      pending: false,
      error: null,
    })),
    on(AuthActions.sessionEnded, (state) => ({
      ...state,
      status: 'anonymous' as const,
      user: null,
      accessToken: null,
      pending: false,
    })),
    on(AuthActions.errorCleared, (state) => ({ ...state, error: null })),
  ),
  extraSelectors: ({ selectStatus }) => ({
    selectIsAuthenticated: createSelector(
      selectStatus,
      (status) => status === 'authenticated',
    ),
  }),
});

export const {
  selectStatus: selectAuthStatus,
  selectUser: selectCurrentUser,
  selectAccessToken,
  selectPending: selectAuthPending,
  selectError: selectAuthError,
  selectIsAuthenticated,
} = authFeature;
