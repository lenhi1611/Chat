// Public API of @realtime-chat/socket.
// The connection is owned by the shell; remotes should not inject
// ChatSocketService directly (see the service's doc comment).
export {
  ChatSocketService,
  SocketNotOpenError,
  type ChatSocketState,
  type SocketRejection,
} from './lib/chat-socket.service';
export {
  provideChatSocket,
  CHAT_SOCKET_CONFIG,
  CHAT_SOCKET_URL,
  SocketRejectedError,
  WEB_SOCKET_FACTORY,
  type ChatSocketConfig,
  type ReconnectOptions,
  type SocketUrlProvider,
  type WebSocketLike,
} from './lib/chat-socket.config';
