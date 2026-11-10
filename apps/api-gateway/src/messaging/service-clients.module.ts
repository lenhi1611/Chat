import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  type RpcClient,
  rpcClientProvider,
} from '@realtime-chat/api-messaging';

/** Inject with `@Inject(AUTH_RPC) auth: RpcClient`. */
export const AUTH_RPC = Symbol('AUTH_RPC');
/** Inject with `@Inject(CHAT_RPC) chat: RpcClient`. */
export const CHAT_RPC = Symbol('CHAT_RPC');

/**
 * RPC clients of the two services. Connected at startup (not awaited: while
 * RabbitMQ is down they keep retrying, and calls answer 503 meanwhile), so a
 * first request does not pay for the connection.
 */
@Global()
@Module({
  providers: [
    rpcClientProvider(AUTH_RPC, 'authRpc'),
    rpcClientProvider(CHAT_RPC, 'chatRpc'),
  ],
  exports: [AUTH_RPC, CHAT_RPC],
})
export class ServiceClientsModule implements OnApplicationBootstrap {
  constructor(
    @Inject(AUTH_RPC) private readonly auth: RpcClient,
    @Inject(CHAT_RPC) private readonly chat: RpcClient,
  ) {}

  onApplicationBootstrap(): void {
    for (const client of [this.auth, this.chat]) {
      void client.connect().catch(() => undefined);
    }
  }
}
