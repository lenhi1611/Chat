import { Routes } from '@angular/router';

/**
 * Root routes of the chat micro-frontend.
 * Exposed to the shell as `./routes` (see federation.config.mjs) and also used
 * when the app runs standalone on port 4202.
 *
 * Nothing here provides chat state: under the shell, the pages use the
 * shell's root Store; standalone, app.config.ts registers it. Needs
 * `withComponentInputBinding()` (the conversation id is a component input).
 */
export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./chat/chat-layout').then((m) => m.ChatLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./chat/no-conversation').then((m) => m.NoConversation),
      },
      {
        path: ':conversationId',
        loadComponent: () =>
          import('./chat/conversation-page').then((m) => m.ConversationPage),
      },
    ],
  },
];
