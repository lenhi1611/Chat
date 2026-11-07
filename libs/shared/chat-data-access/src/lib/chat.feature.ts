import { createFeature, createReducer, on } from '@ngrx/store';
import { ChatActions } from './chat.actions';
import type { ChatError } from './chat.models';

export interface ChatState {
  lastError: ChatError | null;
}

export const initialChatState: ChatState = { lastError: null };

/** The last sending error, shown above the composer. */
export const chatFeature = createFeature({
  name: 'chat',
  reducer: createReducer(
    initialChatState,
    on(ChatActions.serverErrorReceived, (state, { error }) => ({
      ...state,
      lastError: error,
    })),
    on(ChatActions.errorDismissed, (state) => ({ ...state, lastError: null })),
    on(ChatActions.stateReset, () => initialChatState),
  ),
});
