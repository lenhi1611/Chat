import { createEntityAdapter, type EntityState } from '@ngrx/entity';
import { createFeature, createReducer, on } from '@ngrx/store';
import {
  ChatActions,
  ConversationsActions,
  MessagesActions,
} from './chat.actions';
import type {
  ChatMessage,
  Conversation,
  RequestError,
  RequestStatus,
} from './chat.models';

export interface ConversationsState extends EntityState<Conversation> {
  /** `true` once the list has been fetched for this session. */
  loaded: boolean;
  status: RequestStatus;
  error: RequestError | null;
  selectedId: string | null;
  creating: boolean;
  createError: RequestError | null;
}

const lastActivity = (conversation: Conversation): string =>
  conversation.lastMessage?.sentAt ?? conversation.createdAt;

/** Most recent activity first (last message, or creation for an empty one). */
export const conversationsAdapter = createEntityAdapter<Conversation>({
  selectId: (conversation: Conversation) => conversation.id,
  sortComparer: (a: Conversation, b: Conversation) =>
    lastActivity(b).localeCompare(lastActivity(a)) || a.id.localeCompare(b.id),
});

export const initialConversationsState: ConversationsState =
  conversationsAdapter.getInitialState({
    loaded: false,
    status: 'idle',
    error: null,
    selectedId: null,
    creating: false,
    createError: null,
  });

/** Keeps `lastMessage` the newest one, whatever order messages arrive in. */
function withNewerLastMessage(
  state: ConversationsState,
  message: ChatMessage,
): ConversationsState {
  const conversation = state.entities[message.conversationId];
  if (!conversation) return state;
  if (conversation.lastMessage && conversation.lastMessage.seq >= message.seq) {
    return state;
  }
  return conversationsAdapter.updateOne(
    { id: conversation.id, changes: { lastMessage: message } },
    state,
  );
}

export const conversationsFeature = createFeature({
  name: 'conversations',
  reducer: createReducer(
    initialConversationsState,
    on(ConversationsActions.load, (state) => ({
      ...state,
      status: 'loading' as const,
      error: null,
    })),
    // Replaces the list: after a reconnect it is the server's truth. A
    // conversation pushed between the request and the response would be in
    // it already (it is in the database before the push).
    on(ConversationsActions.loadSucceeded, (state, { conversations }) =>
      conversationsAdapter.setAll(conversations, {
        ...state,
        loaded: true,
        status: 'idle' as const,
      }),
    ),
    on(ConversationsActions.loadFailed, (state, { error }) => ({
      ...state,
      status: 'error' as const,
      error,
    })),
    on(ConversationsActions.selected, (state, { conversationId }) => ({
      ...state,
      selectedId: conversationId,
    })),
    on(ConversationsActions.create, (state) => ({
      ...state,
      creating: true,
      createError: null,
    })),
    on(ConversationsActions.createSucceeded, (state, { conversation }) =>
      conversationsAdapter.upsertOne(conversation, {
        ...state,
        creating: false,
      }),
    ),
    on(ConversationsActions.createFailed, (state, { error }) => ({
      ...state,
      creating: false,
      createError: error,
    })),
    on(ConversationsActions.createdRemotely, (state, { conversation }) =>
      conversationsAdapter.upsertOne(conversation, state),
    ),
    on(ChatActions.messageReceived, (state, { message }) =>
      withNewerLastMessage(state, message),
    ),
    on(MessagesActions.pageLoaded, (state, { page }) => {
      const newest = page.items.at(-1);
      return newest ? withNewerLastMessage(state, newest) : state;
    }),
    on(ChatActions.stateReset, () => initialConversationsState),
  ),
  extraSelectors: ({ selectConversationsState }) =>
    conversationsAdapter.getSelectors(selectConversationsState),
});
