import { Routes } from '@angular/router';

/**
 * Root routes of the chat micro-frontend.
 * Exposed to the shell as `./routes` (see federation.config.mjs) and also used
 * when the app runs standalone on port 4202.
 *
 * Nothing here provides chat state: under the shell, ChatPage uses the
 * shell's root Store; standalone, app.config.ts registers it.
 */
export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./chat/chat-page').then((m) => m.ChatPage),
  },
];
