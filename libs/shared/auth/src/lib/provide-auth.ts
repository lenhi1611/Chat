import { HTTP_INTERCEPTORS } from '@angular/common/http';
import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState, Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { AuthActions } from './auth.actions';
import { AUTH_CONFIG, type AuthConfig, withAuthDefaults } from './auth.config';
import { authEffects } from './auth.effects';
import { authFeature, selectAuthStatus } from './auth.feature';
import { AuthApiService } from './auth-api.service';
import { AuthHttpInterceptor } from './auth.interceptor';
import { SessionRefresher } from './session-refresher.service';

/**
 * Startup silent refresh: the app finishes initialising (and routes) only
 * once it knows whether the refresh cookie still holds a session, so a reload
 * does not bounce a signed-in user to the login page.
 */
async function silentRefresh(): Promise<void> {
  const refresher = inject(SessionRefresher);
  const store = inject(Store);
  try {
    await firstValueFrom(refresher.refresh());
  } catch {
    // 401 already ended the session; other failures (offline…) as well:
    // nobody is signed in until a refresh or a login succeeds.
    if (store.selectSignal(selectAuthStatus)() === 'unknown') {
      store.dispatch(AuthActions.sessionEnded({ reason: 'no-session' }));
    }
  }
}

/**
 * Authentication for the app that owns the session (the shell; a remote only
 * when it runs standalone). Requires `provideStore()` and
 * `provideHttpClient(withInterceptorsFromDi())` (Angular exposes no public
 * way for a library to add a functional interceptor). Remotes loaded by the
 * shell must not call it again.
 */
export function provideAuth(config: AuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AUTH_CONFIG, useValue: withAuthDefaults(config) },
    provideState(authFeature),
    provideEffects(authEffects),
    AuthApiService,
    SessionRefresher,
    { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
    provideAppInitializer(silentRefresh),
  ]);
}
