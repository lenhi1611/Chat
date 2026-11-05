import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_GLOBAL_PREFIX } from '@realtime-chat/contracts';
import { ChatWsAdapter } from '../chat/transport/chat-ws.adapter';
import type { Env } from '../config/env.schema';

/**
 * HTTP + WebSocket setup shared by main.ts and the integration tests, so tests
 * exercise the same prefix, CORS and WebSocket server options as production.
 */
export function configureApp(app: INestApplication): ConfigService<Env, true> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  // Plain `ws` on the HTTP server's port (gateway port 0), path from WS_PATH.
  app.useWebSocketAdapter(
    new ChatWsAdapter(app, {
      path: config.get('WS_PATH', { infer: true }),
      allowedOrigins: config.get('WS_ALLOWED_ORIGINS', { infer: true }),
    }),
  );

  return config;
}
