import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '@realtime-chat/api-redis';
import { ChatModule } from '../chat/chat.module';
import { type Env, validateEnv } from '../config/env.schema';
import { HealthModule } from '../health/health.module';

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
    HealthModule,
    ChatModule,
  ],
})
export class AppModule {}
