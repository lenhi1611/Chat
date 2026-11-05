import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { provideChatConnection } from './chat/provide-chat-connection';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideZard(),
    // Root Store, shared with every remote through Native Federation.
    provideStore(),
    provideStoreDevtools({
      name: 'realtime-chat',
      maxAge: 50,
      logOnly: environment.production,
      autoPause: true,
    }),
    provideChatConnection(environment.wsUrl),
  ],
};
