import { createSelector } from '@ngrx/store';
import { chatFeature } from './chat.feature';
import type { ChatMessage, HistoryView } from './chat.models';
import { connectionFeature } from './connection.feature';
import { conversationsFeature } from './conversations.feature';
import { emptyHistory } from './history';
import { messagesFeature } from './messages.feature';

// --- connection ----------------------------------------------------------------

export const selectConnectionStatus = connectionFeature.selectStatus;
export const selectIsConnected = connectionFeature.selectIsConnected;
export const selectUserId = connectionFeature.selectUserId;

/**
 * Predicate telling whether a message was sent by the signed-in user (its
 * senderId is the userId of session.welcome).
 */
export const selectIsOwnMessage = createSelector(
  selectUserId,
  (userId) =>
    (message: Pick<ChatMessage, 'senderId'>): boolean =>
      userId !== null && message.senderId === userId,
);

export const selectLastError = chatFeature.selectLastError;

// --- conversations -------------------------------------------------------------

/** Most recent activity first. */
export const selectConversations = conversationsFeature.selectAll;
export const selectConversationsLoaded = conversationsFeature.selectLoaded;
export const selectConversationsLoading = createSelector(
  conversationsFeature.selectStatus,
  (status) => status === 'loading',
);
export const selectConversationsError = conversationsFeature.selectError;
export const selectCreatingConversation = conversationsFeature.selectCreating;
export const selectCreateConversationError =
  conversationsFeature.selectCreateError;

export const selectSelectedConversationId =
  conversationsFeature.selectSelectedId;
export const selectSelectedConversation = createSelector(
  conversationsFeature.selectEntities,
  conversationsFeature.selectSelectedId,
  (entities, id) => (id ? (entities[id] ?? null) : null),
);

// --- messages ------------------------------------------------------------------

const EMPTY_HISTORY = emptyHistory();

const selectSelectedHistory = createSelector(
  messagesFeature.selectHistories,
  conversationsFeature.selectSelectedId,
  (histories, id) => (id ? (histories[id] ?? EMPTY_HISTORY) : EMPTY_HISTORY),
);

/** Messages of the open conversation, oldest first (ascending `seq`). */
export const selectSelectedMessages = createSelector(
  selectSelectedHistory,
  (history) => history.messages,
);

export const selectSelectedHistoryView = createSelector(
  selectSelectedHistory,
  (history): HistoryView => ({
    loaded: history.loaded,
    loading: history.status === 'loading',
    hasOlder: !history.loaded || history.nextBefore !== null,
    error: history.error,
  }),
);
