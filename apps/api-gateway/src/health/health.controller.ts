import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import {
  MessagingConnection,
  type RpcClient,
} from '@realtime-chat/api-messaging';
import {
  API_PATHS,
  type HealthResponse,
  RPC_PATTERNS,
  type ServiceHealth,
} from '@realtime-chat/contracts';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CorrelationId } from '../http/correlation-id';
import { AUTH_RPC, CHAT_RPC } from '../messaging/service-clients.module';

/** A health check must answer fast even when a service does not. */
const PING_TIMEOUT_MS = 1500;

/**
 * Public, no token. 200 `ok` when RabbitMQ and both services answer, else
 * 503 `degraded` with which part is down (so a load balancer or a test
 * runner waiting for the stack can wait on it).
 */
@Public()
@Controller(API_PATHS.health)
export class HealthController {
  constructor(
    @Inject(AUTH_RPC) private readonly auth: RpcClient,
    @Inject(CHAT_RPC) private readonly chat: RpcClient,
    private readonly messaging: MessagingConnection,
  ) {}

  @Get()
  async check(
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const ping = (
      client: RpcClient,
      pattern: typeof RPC_PATTERNS.authPing | typeof RPC_PATTERNS.chatPing,
    ) =>
      client
        .call(pattern, {}, correlationId, { timeoutMs: PING_TIMEOUT_MS })
        .then(
          (): ServiceHealth => 'up',
          (): ServiceHealth => 'down',
        );
    const [auth, chat] = await Promise.all([
      ping(this.auth, RPC_PATTERNS.authPing),
      ping(this.chat, RPC_PATTERNS.chatPing),
    ]);
    const rabbitmq: ServiceHealth = this.messaging.isConnected()
      ? 'up'
      : 'down';
    const services = { auth, chat, rabbitmq };
    const ok = Object.values(services).every((state) => state === 'up');
    response.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'degraded', services };
  }
}
