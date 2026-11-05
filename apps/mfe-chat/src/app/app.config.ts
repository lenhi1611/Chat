import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore, Store } from '@ngrx/store';
import { ChatActions, provideChatData } from '@realtime-chat/chat-data-access';
import { provideChatSocket } from '@realtime-chat/socket';
import { provideZard } from '@realtime-chat/ui';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

// Standalone mode only. When loaded by the shell, this file is not used: the
// remote's routes run in the shell's injector, with the shell's Store, chat
// state and single WebSocket (see apps/shell/src/app/chat). That is the only
// reason this app may import @realtime-chat/socket.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideZard(),
    provideStore(),
    provideChatSocket({ url: environment.wsUrl }),
    provideChatData(),
    provideAppInitializer(() => inject(Store).dispatch(ChatActions.connect())),
  ],
};
