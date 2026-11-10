import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MessagingModule } from '@realtime-chat/api-messaging';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AccessTokenVerifier } from '../auth/access-token.verifier';
import { AuthHttpModule } from '../auth/auth-http.module';
import { ChatModule } from '../chat/chat.module';
import { type Env, validateEnv } from '../config/env.schema';
import { ConversationsHttpModule } from '../conversations/conversations-http.module';
import { HealthModule } from '../health/health.module';
import { ApiExceptionFilter } from '../http/api-exception.filter';
import { ServiceClientsModule } from '../messaging/service-clients.module';

/**
 * The edge: HTTP and WebSocket for browsers, RabbitMQ to the services. No
 * database, no Redis: requests become RPCs (auth-service, chat-service),
 * `chat.send` frames become commands, service events become frames.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Resolved from the workspace root (where nx runs the app).
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    // Publishing connection (commands) + topology; global.
    MessagingModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('RABBITMQ_URL', { infer: true }),
        connectionName: 'api-gateway',
        rpcTimeoutMs: config.get('RPC_TIMEOUT_MS', { infer: true }),
      }),
    }),
    ServiceClientsModule,
    HealthModule,
    AuthHttpModule,
    ConversationsHttpModule,
    ChatModule,
  ],
  providers: [
    AccessTokenVerifier,
    // Every HTTP route requires a Bearer access token unless @Public().
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    // Every HTTP error leaves as { error: { code, message, details? } }.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
