import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env.schema';
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
    HealthModule,
  ],
})
export class AppModule {}
