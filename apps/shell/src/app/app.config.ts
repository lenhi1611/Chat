import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideAuth } from '@realtime-chat/auth';
import { provideChatConnection } from '@realtime-chat/chat-data-access';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    // withInterceptorsFromDi: provideAuth installs its token interceptor via DI.
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    provideZard(),
    // Root Store, shared with every remote through Native Federation.
    provideStore(),
    provideStoreDevtools({
      name: 'realtime-chat',
      maxAge: 50,
      logOnly: environment.production,
      autoPause: true,
    }),
    // Session: silent refresh at startup, token in memory, guards, interceptor.
    provideAuth({ apiBaseUrl: environment.apiBaseUrl }),
    // The chat socket follows the session: it connects once signed in.
    provideChatConnection({
      wsUrl: environment.wsUrl,
      apiBaseUrl: environment.apiBaseUrl,
    }),
  ],
};
