import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import {
  commandServerOptions,
  eventServerOptions,
  MESSAGING_OPTIONS,
  type ResolvedMessagingOptions,
  rpcServerOptions,
} from '@realtime-chat/api-messaging';
import { AppModule } from './app/app.module';

/**
 * A Nest application that never listens on HTTP: three RabbitMQ servers, for
 * RPCs (`chat.rpc`), commands (`chat.commands`, prefetch 1, manual ack) and
 * user sync (`chat.user-sync`, manual ack). Hybrid rather than
 * `createMicroservice` so shutdown drains running handlers before the servers
 * close (see auth-service).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const { url, topology } =
    app.get<ResolvedMessagingOptions>(MESSAGING_OPTIONS);
  for (const options of [
    rpcServerOptions(url, topology, 'chatRpc'),
    commandServerOptions(url, topology),
    eventServerOptions(url, topology, { durableQueue: 'chatUserSync' }),
  ]) {
    app.connectMicroservice<MicroserviceOptions>(options, {
      inheritAppConfig: true,
    });
  }
  await app.init();

  // Waits (retrying) while RabbitMQ is down instead of crashing.
  Logger.log('Connecting to RabbitMQ…', 'ChatService');
  await app.startAllMicroservices();
  const { names } = topology;
  Logger.log(
    `Consuming ${names.chatRpc}, ${names.chatCommands}, ${names.chatUserSync}`,
    'ChatService',
  );
}

bootstrap();
