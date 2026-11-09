import { Inject, Injectable } from '@nestjs/common';
import type { UserSource } from '@realtime-chat/api-chat';
import type { RpcClient } from '@realtime-chat/api-messaging';
import { RPC_PATTERNS, type UserSummary } from '@realtime-chat/contracts';

/** Inject with `@Inject(AUTH_RPC) auth: RpcClient`. */
export const AUTH_RPC = Symbol('AUTH_RPC');

/**
 * The chat domain's read-through source: users it has never seen are asked
 * of auth-service (`auth.users.summaries`). Only then does chat depend on
 * auth-service being up.
 */
@Injectable()
export class AuthRpcUserSource implements UserSource {
  constructor(@Inject(AUTH_RPC) private readonly auth: RpcClient) {}

  findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    return this.auth.call(
      RPC_PATTERNS.authUsersSummaries,
      { ids: [...ids] },
      crypto.randomUUID(),
    );
  }
}
