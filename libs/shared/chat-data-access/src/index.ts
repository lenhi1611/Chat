// Public API of @realtime-chat/chat-data-access: providers, actions,
// selectors and types. Reducers, effects and the socket stay internal.
export { provideChatData } from './lib/provide-chat-data';
export { provideChatConnection } from './lib/provide-chat-connection';
export { ChatActions } from './lib/chat.actions';
export {
  selectConnectionStatus,
  selectIsConnected,
  selectIsOwnMessage,
  selectLastError,
  selectMessages,
  selectUserId,
} from './lib/chat.selectors';
export type {
  ChatError,
  ChatMessage,
  ConnectionStatus,
} from './lib/chat.models';
