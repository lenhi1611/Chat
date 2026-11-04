import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideZard } from '@realtime-chat/ui';
import { appRoutes } from './app.routes';

// Standalone mode only. When loaded by the shell, the shell's providers
// (including provideZard) apply to the remote's routes.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideZard(),
  ],
};
