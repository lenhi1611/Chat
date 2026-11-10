import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MicroserviceOptions } from '@nestjs/microservices';
import {
  eventServerOptions,
  gatewayEventsQueueName,
  MESSAGING_OPTIONS,
  type ResolvedMessagingOptions,
  type RpcClient,
} from '@realtime-chat/api-messaging';
import {
  API_GLOBAL_PREFIX,
  AppError,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';
import cookieParser from 'cookie-parser';
import { ChatWsAdapter } from '../chat/transport/chat-ws.adapter';
import type { SocketOwner } from '../chat/transport/upgrade-verifier';
import type { Env } from '../config/env.schema';
import { correlationIdMiddleware } from '../http/correlation-id';
import { AUTH_RPC } from '../messaging/service-clients.module';

/**
 * HTTP + WebSocket setup shared by main.ts and the integration tests, so tests
 * exercise the same prefix, CORS and WebSocket server options as production.
 */
export function configureApp(app: INestApplication): ConfigService<Env, true> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const auth = app.get<RpcClient>(AUTH_RPC);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  // credentials: the browser sends (and accepts) the refresh-token cookie on
  // cross-origin calls from the listed apps. Only listed origins, never '*'.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  // Reads the refresh-token cookie (req.cookies) on /api/auth/*.
  app.use(cookieParser());
  // A correlation id per request, passed on to the services and logged.
  app.use(correlationIdMiddleware);
  // Plain `ws` on the HTTP server's port (gateway port 0), path from WS_PATH.
  app.useWebSocketAdapter(
    new ChatWsAdapter(app, {
      path: config.get('WS_PATH', { infer: true }),
      allowedOrigins: config.get('WS_ALLOWED_ORIGINS', { infer: true }),
      // Sockets authenticate with a single-use ticket during the upgrade,
      // consumed by auth-service.
      consumeTicket: (ticket) => consumeTicket(auth, ticket),
    }),
  );

  return config;
}

/**
 * Ticket → owner (or null: 401). auth-service unreachable rejects (503);
 * any other refusal of the ticket by the service is a plain 401.
 */
async function consumeTicket(
  auth: RpcClient,
  ticket: string,
): Promise<SocketOwner | null> {
  try {
    const { owner } = await auth.call(
      RPC_PATTERNS.authWsTicketConsume,
      { ticket },
      crypto.randomUUID(),
    );
    return owner;
  } catch (error) {
    if (error instanceof AppError && error.code !== 'SERVICE_UNAVAILABLE') {
      return null;
    }
    throw error;
  }
}

/**
 * This instance's events consumer: its own queue `gateway.events.<id>`
 * (exclusive, re-declared on every reconnect), bound by Nest to the four
 * event types of GatewayEventsController.
 */
export function connectGatewayEvents(
  app: INestApplication,
  instanceId: string,
): void {
  const { url, topology } =
    app.get<ResolvedMessagingOptions>(MESSAGING_OPTIONS);
  app.connectMicroservice<MicroserviceOptions>(
    eventServerOptions(url, topology, {
      instanceQueue: gatewayEventsQueueName(topology, instanceId),
    }),
    { inheritAppConfig: true },
  );
}
