import { createFeature, createReducer, createSelector, on } from '@ngrx/store';
import { ChatActions } from './chat.actions';
import type { ConnectionStatus } from './chat.models';

export interface ConnectionState {
  status: ConnectionStatus;
  /** Known once the server has sent `session.welcome`. */
  clientId: string | null;
  nickname: string | null;
}

export const initialConnectionState: ConnectionState = {
  status: 'idle',
  clientId: null,
  nickname: null,
};

export const connectionFeature = createFeature({
  name: 'connection',
  reducer: createReducer(
    initialConnectionState,
    on(ChatActions.connectionStatusChanged, (state, { status }) => ({
      ...state,
      status,
    })),
    on(ChatActions.welcomeReceived, (state, { clientId, nickname }) => ({
      ...state,
      clientId,
      nickname,
    })),
  ),
  extraSelectors: ({ selectStatus }) => ({
    selectIsConnected: createSelector(
      selectStatus,
      (status) => status === 'open',
    ),
  }),
});
