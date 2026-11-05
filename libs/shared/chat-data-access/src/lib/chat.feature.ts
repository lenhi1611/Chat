import { createEntityAdapter, type EntityState } from '@ngrx/entity';
import { createFeature, createReducer, on } from '@ngrx/store';
import { ChatActions } from './chat.actions';
import type { ChatError, ChatMessage } from './chat.models';

export interface ChatState extends EntityState<ChatMessage> {
  lastError: ChatError | null;
}

/**
 * Messages keyed by their server id and kept in server order (`sentAt`, then
 * id as a tie-breaker). `addOne` ignores an id it already has, so a message
 * delivered twice is stored once.
 */
export const messagesAdapter = createEntityAdapter<ChatMessage>({
  selectId: (message: ChatMessage) => message.id,
  sortComparer: (a: ChatMessage, b: ChatMessage) =>
    a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
});

export const initialChatState: ChatState = messagesAdapter.getInitialState({
  lastError: null,
});

export const chatFeature = createFeature({
  name: 'chat',
  reducer: createReducer(
    initialChatState,
    on(ChatActions.messageReceived, (state, { message }) =>
      messagesAdapter.addOne(message, state),
    ),
    on(ChatActions.serverErrorReceived, (state, { error }) => ({
      ...state,
      lastError: error,
    })),
    on(ChatActions.errorDismissed, (state) => ({ ...state, lastError: null })),
  ),
  extraSelectors: ({ selectChatState }) => ({
    ...messagesAdapter.getSelectors(selectChatState),
  }),
});
