import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideChatConnection } from '@realtime-chat/chat-data-access';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

// Standalone mode only. When loaded by the shell, this file is not used: the
// remote's routes run in the shell's injector, with the shell's Store, chat
// state and single WebSocket. Standalone, the remote owns its own connection,
// through the same provider the shell uses (no direct socket import: lint).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideZard(),
    provideStore(),
    provideChatConnection(environment.wsUrl),
  ],
};
