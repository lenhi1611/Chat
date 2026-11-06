import {
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { CHAT_API_BASE_URL, ChatApiService } from './chat-api.service';
import { chatEffects } from './chat.effects';
import { chatFeature } from './chat.feature';
import { connectionFeature } from './connection.feature';
import { conversationsEffects } from './conversations.effects';
import { conversationsFeature } from './conversations.feature';
import { messagesFeature } from './messages.feature';

/**
 * Registers the chat state (connection, conversations, histories, errors),
 * its effects and REST client.
 *
 * Called by provideChatConnection, ONCE, at the root of the application that
 * owns the connection. Remotes loaded by the shell must not call it again:
 * they share the shell's Store.
 */
export function provideChatData(apiBaseUrl: string): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CHAT_API_BASE_URL, useValue: apiBaseUrl.replace(/\/+$/, '') },
    ChatApiService,
    provideState(connectionFeature),
    provideState(conversationsFeature),
    provideState(messagesFeature),
    provideState(chatFeature),
    provideEffects(chatEffects, conversationsEffects),
  ]);
}
