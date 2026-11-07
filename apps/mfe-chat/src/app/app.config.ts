import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideAuth } from '@realtime-chat/auth';
import { provideChatConnection } from '@realtime-chat/chat-data-access';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

// Standalone mode only. When loaded by the shell, this file is not used: the
// remote's routes run in the shell's injector, with the shell's Store, session,
// chat state and single WebSocket. Standalone, the remote owns its own session
// (silent refresh with the cookie set by a sign-in on the shell; no sign-in
// form here, see signed-out-page.ts) and
// connection, through the same providers the shell uses.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptorsFromDi()),
    provideZard(),
    provideStore(),
    provideAuth({
      apiBaseUrl: environment.apiBaseUrl,
      loginPath: '/signed-out',
      defaultAuthenticatedPath: '/',
    }),
    provideChatConnection({
      wsUrl: environment.wsUrl,
      apiBaseUrl: environment.apiBaseUrl,
    }),
  ],
};
