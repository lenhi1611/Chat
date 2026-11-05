import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
  type Type,
} from '@nestjs/common';
import { CHAT_OPTIONS, type ChatModuleOptions } from './chat.options';
import { ChatService } from './chat.service';
import {
  CHAT_DATABASE_URL,
  ChatPrismaService,
} from './prisma/chat-prisma.service';
import { USERS_PORT, type UsersPort } from './users.port';

export interface ChatDomainModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: InjectionToken[];
  useFactory: (
    ...args: never[]
  ) => ChatModuleOptions | Promise<ChatModuleOptions>;
  /** Implementation of the users port (where user summaries come from). */
  usersPort: Type<UsersPort>;
}

/**
 * The chat domain: conversations, members, messages. Global, so the app
 * registers it once and any module can inject ChatService. The app supplies
 * `usersPort` (chat never imports the auth domain).
 */
@Module({})
export class ChatDomainModule {
  static forRootAsync(options: ChatDomainModuleAsyncOptions): DynamicModule {
    return {
      module: ChatDomainModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: CHAT_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: CHAT_DATABASE_URL,
          inject: [CHAT_OPTIONS],
          useFactory: (chatOptions: ChatModuleOptions) =>
            chatOptions.databaseUrl,
        },
        { provide: USERS_PORT, useClass: options.usersPort },
        ChatPrismaService,
        ChatService,
      ],
      exports: [ChatService],
    };
  }
}
