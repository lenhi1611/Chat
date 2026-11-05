// Public API of @realtime-chat/api-chat: conversations and messages.
// Prisma stays private to the chat domain.
export {
  ChatDomainModule,
  type ChatDomainModuleAsyncOptions,
} from './lib/chat-domain.module';
export type { ChatModuleOptions } from './lib/chat.options';
export { ChatService, type Created, type NewMessage } from './lib/chat.service';
export { USERS_PORT, type UsersPort } from './lib/users.port';
