import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@realtime-chat/api-auth';
import { ChatDomainModule } from '@realtime-chat/api-chat';
import { RedisModule } from '@realtime-chat/api-redis';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AuthHttpModule } from '../auth/auth-http.module';
import { ChatModule } from '../chat/chat.module';
import { AuthUsersAdapter } from '../conversations/auth-users.adapter';
import { ConversationsHttpModule } from '../conversations/conversations-http.module';
import { type Env, validateEnv } from '../config/env.schema';
import { HealthModule } from '../health/health.module';
import { ApiExceptionFilter } from '../http/api-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Resolved from the workspace root (where nx runs the app).
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    // One Redis connection for the whole app (global: no need to re-import).
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        url: config.get('REDIS_URL', { infer: true }),
        connectionName: 'api-gateway',
      }),
    }),
    // Auth domain (libs/api/auth), global: its services are injectable anywhere.
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
    // Chat domain (libs/api/chat), global; user summaries come from the auth
    // domain through this app's adapter (the domains never import each other).
    ChatDomainModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        databaseUrl: config.get('DATABASE_URL_CHAT', { infer: true }),
      }),
      usersPort: AuthUsersAdapter,
    }),
    HealthModule,
    AuthHttpModule,
    ConversationsHttpModule,
    ChatModule,
  ],
  providers: [
    // Every HTTP route requires a Bearer access token unless @Public().
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    // Every HTTP error leaves as { error: { code, message, details? } }.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
