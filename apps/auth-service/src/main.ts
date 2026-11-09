import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import {
  MESSAGING_OPTIONS,
  type ResolvedMessagingOptions,
  rpcServerOptions,
} from '@realtime-chat/api-messaging';
import { AppModule } from './app/app.module';

/**
 * A Nest application that never listens on HTTP: its only transport is the
 * RabbitMQ server below. (Not `createMicroservice`: on shutdown that closes
 * the server before the lifecycle hooks run, so in-flight handlers could not
 * finish; here `beforeApplicationShutdown` drains them first.)
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const messaging = app.get<ResolvedMessagingOptions>(MESSAGING_OPTIONS);
  app.connectMicroservice<MicroserviceOptions>(
    rpcServerOptions(messaging.url, messaging.topology, 'authRpc'),
    { inheritAppConfig: true },
  );
  await app.init();

  // Waits (retrying) while RabbitMQ is down instead of crashing.
  Logger.log('Connecting to RabbitMQ…', 'AuthService');
  await app.startAllMicroservices();
  Logger.log(
    `Answering RPCs on ${messaging.topology.names.authRpc}`,
    'AuthService',
  );
}

bootstrap();
