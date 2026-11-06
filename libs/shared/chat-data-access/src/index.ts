// Public API of @realtime-chat/chat-data-access: providers, actions,
// selectors and types. Reducers, effects, the REST client and the socket stay
// internal.
export {
  provideChatConnection,
  type ChatConnectionConfig,
} from './lib/provide-chat-connection';
export {
  ChatActions,
  ConversationsActions,
  MessagesActions,
} from './lib/chat.actions';
export {
  selectConnectionStatus,
  selectConversations,
  selectConversationsError,
  selectConversationsLoaded,
  selectConversationsLoading,
  selectCreateConversationError,
  selectCreatingConversation,
  selectIsConnected,
  selectIsOwnMessage,
  selectLastError,
  selectSelectedConversation,
  selectSelectedConversationId,
  selectSelectedHistoryView,
  selectSelectedMessages,
  selectUserId,
} from './lib/chat.selectors';
export type {
  ChatError,
  ChatMessage,
  ConnectionStatus,
  Conversation,
  HistoryView,
  RequestError,
} from './lib/chat.models';
