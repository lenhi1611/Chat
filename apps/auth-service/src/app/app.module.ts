import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@realtime-chat/api-auth';
import { MessagingModule } from '@realtime-chat/api-messaging';
import { RedisModule } from '@realtime-chat/api-redis';
import { type Env, validateEnv } from '../config/env.schema';
import { AuthRpcController } from '../rpc/auth-rpc.controller';

/**
 * auth-service: the auth domain behind RabbitMQ. Owns auth_db and Redis (WS
 * tickets); answers `auth.*` RPCs and publishes `auth.*` events. No HTTP.
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
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('REDIS_URL', { infer: true }),
        connectionName: 'auth-service',
      }),
    }),
    // Publishing connection + EVENT_PUBLISHER, used by AuthService.
    MessagingModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('RABBITMQ_URL', { infer: true }),
        connectionName: 'auth-service',
        rpcTimeoutMs: config.get('RPC_TIMEOUT_MS', { infer: true }),
      }),
    }),
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        databaseUrl: config.get('DATABASE_URL_AUTH', { infer: true }),
        jwtAccessSecret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        accessTokenTtlSeconds: config.get('JWT_ACCESS_TTL_SECONDS', {
          infer: true,
        }),
        refreshTokenTtlDays: config.get('REFRESH_TTL_DAYS', { infer: true }),
        refreshReuseGraceSeconds: config.get('REFRESH_REUSE_GRACE_SECONDS', {
          infer: true,
        }),
        wsTicketTtlSeconds: config.get('WS_TICKET_TTL_SECONDS', {
          infer: true,
        }),
      }),
    }),
  ],
  controllers: [AuthRpcController],
})
export class AppModule {}
