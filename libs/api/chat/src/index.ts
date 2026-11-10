// Public API of @realtime-chat/api-chat: conversations and messages.
// Prisma stays private to the chat domain.
export {
  ChatDomainModule,
  type ChatDomainModuleAsyncOptions,
} from './lib/chat-domain.module';
export type { ChatModuleOptions } from './lib/chat.options';
export { ChatService, type Created, type NewMessage } from './lib/chat.service';
export { UserDirectory } from './lib/user-directory';
export { USER_SOURCE, type UserSource } from './lib/user-source.port';
