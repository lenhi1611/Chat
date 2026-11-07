import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import { ChatActions } from './chat.actions';
import type { ConnectionStatus } from './chat.models';

export interface ConnectionState {
  status: ConnectionStatus;
  /** The authenticated user, known once the server has sent `session.welcome`. */
  userId: string | null;
}

export const initialConnectionState: ConnectionState = {
  status: 'idle',
  userId: null,
};

export const connectionFeature = createFeature({
  name: 'connection',
  reducer: createReducer(
    initialConnectionState,
    on(ChatActions.connectionStatusChanged, (state, { status }) => ({
      ...state,
      status,
    })),
    on(ChatActions.welcomeReceived, (state, { userId }) => ({
      ...state,
      userId,
    })),
    // The status is the socket's (already `closed` by then): keep it.
    on(ChatActions.stateReset, (state) => ({ ...state, userId: null })),
  ),
  extraSelectors: ({ selectStatus }) => ({
    selectIsConnected: createSelector(
      selectStatus,
      (status) => status === 'open',
    ),
  }),
});
