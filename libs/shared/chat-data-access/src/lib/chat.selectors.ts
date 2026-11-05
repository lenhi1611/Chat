import { createSelector } from '@ngrx/store';
import { chatFeature } from './chat.feature';
import type { ChatMessage } from './chat.models';
import { connectionFeature } from './connection.feature';

/** Messages in server order (oldest first). */
export const selectMessages = chatFeature.selectAll;

export const selectLastError = chatFeature.selectLastError;

export const selectConnectionStatus = connectionFeature.selectStatus;
export const selectIsConnected = connectionFeature.selectIsConnected;
export const selectClientId = connectionFeature.selectClientId;
export const selectNickname = connectionFeature.selectNickname;

/**
 * Predicate telling whether a message was sent by this client. A message is
 * "mine" when its senderId is the persisted clientId, so it stays mine across
 * reconnects and reloads.
 */
export const selectIsOwnMessage = createSelector(
  selectClientId,
  (clientId) =>
    (message: Pick<ChatMessage, 'senderId'>): boolean =>
      clientId !== null && message.senderId === clientId,
);
