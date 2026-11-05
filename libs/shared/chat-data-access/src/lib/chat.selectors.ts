import { createSelector } from '@ngrx/store';
import { chatFeature } from './chat.feature';
import type { ChatMessage } from './chat.models';
import { connectionFeature } from './connection.feature';

/** Messages in server order (oldest first). */
export const selectMessages = chatFeature.selectAll;

export const selectLastError = chatFeature.selectLastError;

export const selectConnectionStatus = connectionFeature.selectStatus;
export const selectIsConnected = connectionFeature.selectIsConnected;
export const selectUserId = connectionFeature.selectUserId;

/**
 * Predicate telling whether a message was sent by the signed-in user (its
 * senderId is the userId of session.welcome), so it stays "mine" across
 * reconnects, tabs and reloads.
 */
export const selectIsOwnMessage = createSelector(
  selectUserId,
  (userId) =>
    (message: Pick<ChatMessage, 'senderId'>): boolean =>
      userId !== null && message.senderId === userId,
);
