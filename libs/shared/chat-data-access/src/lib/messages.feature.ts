import { createFeature, createReducer, on } from '@ngrx/store';
import { ChatActions, MessagesActions } from './chat.actions';
import type { ConversationHistory } from './chat.models';
import {
  addLiveMessage,
  applyLatestPage,
  applyOlderPage,
  emptyHistory,
} from './history';

export interface MessagesState {
  /** By conversation id; absent until something is known about it. */
  histories: Record<string, ConversationHistory>;
}

export const initialMessagesState: MessagesState = { histories: {} };

function update(
  state: MessagesState,
  conversationId: string,
  change: (history: ConversationHistory) => ConversationHistory,
): MessagesState {
  const current = state.histories[conversationId] ?? emptyHistory();
  return {
    ...state,
    histories: { ...state.histories, [conversationId]: change(current) },
  };
}

export const messagesFeature = createFeature({
  name: 'messages',
  reducer: createReducer(
    initialMessagesState,
    on(ChatActions.messageReceived, (state, { message }) =>
      update(state, message.conversationId, (history) =>
        addLiveMessage(history, message),
      ),
    ),
    on(MessagesActions.pageRequested, (state, { conversationId }) =>
      update(state, conversationId, (history) => ({
        ...history,
        status: 'loading',
        error: null,
      })),
    ),
    on(
      MessagesActions.pageLoaded,
      (state, { conversationId, mode, before, page }) =>
        update(state, conversationId, (history) =>
          mode === 'latest'
            ? applyLatestPage(history, page)
            : applyOlderPage(history, before, page),
        ),
    ),
    on(MessagesActions.pageFailed, (state, { conversationId, error }) =>
      update(state, conversationId, (history) => ({
        ...history,
        status: 'error',
        error,
      })),
    ),
    on(ChatActions.stateReset, () => initialMessagesState),
  ),
});
