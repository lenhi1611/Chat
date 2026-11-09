import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatDomainModule } from '@realtime-chat/api-chat';
import { MessagingModule } from '@realtime-chat/api-messaging';
import { type Env, validateEnv } from '../config/env.schema';
import { ChatCommandsController } from '../consumers/chat-commands.controller';
import { UserSyncController } from '../consumers/user-sync.controller';
import { ChatRpcController } from '../rpc/chat-rpc.controller';
import { AuthRpcUserSource } from '../users/auth-rpc-user-source';
import { AuthRpcModule } from '../users/auth-rpc.module';

/**
 * chat-service: the chat domain behind RabbitMQ. Owns chat_db; answers
 * `chat.*` RPCs, consumes `chat.commands` and `chat.user-sync`, publishes
 * `chat.*` events. No HTTP.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    MessagingModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('RABBITMQ_URL', { infer: true }),
        connectionName: 'chat-service',
        rpcTimeoutMs: config.get('RPC_TIMEOUT_MS', { infer: true }),
      }),
    }),
    ChatDomainModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        databaseUrl: config.get('DATABASE_URL_CHAT', { infer: true }),
      }),
      imports: [AuthRpcModule],
      userSource: AuthRpcUserSource,
    }),
  ],
  controllers: [ChatRpcController, ChatCommandsController, UserSyncController],
})
export class AppModule {}
