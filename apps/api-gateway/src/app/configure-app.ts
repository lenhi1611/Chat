import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsTicketService } from '@realtime-chat/api-auth';
import { API_GLOBAL_PREFIX } from '@realtime-chat/contracts';
import cookieParser from 'cookie-parser';
import { ChatWsAdapter } from '../chat/transport/chat-ws.adapter';
import type { Env } from '../config/env.schema';

/**
 * HTTP + WebSocket setup shared by main.ts and the integration tests, so tests
 * exercise the same prefix, CORS and WebSocket server options as production.
 */
export function configureApp(app: INestApplication): ConfigService<Env, true> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const tickets = app.get(WsTicketService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  // credentials: the browser sends (and accepts) the refresh-token cookie on
  // cross-origin calls from the listed apps. Only listed origins, never '*'.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  // Reads the refresh-token cookie (req.cookies) on /api/auth/*.
  app.use(cookieParser());
  // Plain `ws` on the HTTP server's port (gateway port 0), path from WS_PATH.
  app.useWebSocketAdapter(
    new ChatWsAdapter(app, {
      path: config.get('WS_PATH', { infer: true }),
      allowedOrigins: config.get('WS_ALLOWED_ORIGINS', { infer: true }),
      // Sockets authenticate with a single-use ticket during the upgrade.
      consumeTicket: (ticket) => tickets.consume(ticket),
    }),
  );

  return config;
}
