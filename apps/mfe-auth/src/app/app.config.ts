import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideAuth } from '@realtime-chat/auth';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

// Standalone mode only (port 4201). Loaded by the shell, this file is not
// used: the pages run in the shell's injector with the shell's session.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    // provideAuth installs its token interceptor through DI.
    provideHttpClient(withInterceptorsFromDi()),
    provideZard(),
    provideStore(),
    provideAuth({
      apiBaseUrl: environment.apiBaseUrl,
      loginPath: '/login',
      defaultAuthenticatedPath: '/signed-in',
    }),
  ],
};
