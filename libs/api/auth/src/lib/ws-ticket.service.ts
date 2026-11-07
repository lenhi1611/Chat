import { Inject, Injectable } from '@nestjs/common';
import type { WsTicketResponse } from '@realtime-chat/contracts';
import { REDIS_CLIENT } from '@realtime-chat/api-redis';
import type { Redis } from 'ioredis';
import { AUTH_OPTIONS, type AuthModuleOptions } from './auth.options';
import { generateOpaqueToken } from './refresh-token';

/** Who a WebSocket ticket was issued to. */
export interface WsTicketOwner {
  userId: string;
  sid: string;
}

const KEY_PREFIX = 'ws-ticket:';

/**
 * Single-use tickets for opening a WebSocket (`?ticket=`), because browsers
 * cannot send an Authorization header on the upgrade and an access token in a
 * URL would end up in logs. Stored in Redis with a short TTL; consumed with
 * GETDEL so a ticket works exactly once.
 */
@Injectable()
export class WsTicketService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
  ) {}

  async issue(owner: WsTicketOwner): Promise<WsTicketResponse> {
    const ticket = generateOpaqueToken();
    const expiresIn = this.options.wsTicketTtlSeconds;
    await this.redis.set(
      KEY_PREFIX + ticket,
      JSON.stringify({ userId: owner.userId, sid: owner.sid }),
      'EX',
      expiresIn,
    );
    return { ticket, expiresIn };
  }

  /** The owner of `ticket`, or null if unknown, expired or already used. */
  async consume(ticket: string): Promise<WsTicketOwner | null> {
    const stored = await this.redis.getdel(KEY_PREFIX + ticket);
    if (!stored) return null;
    try {
      const value: unknown = JSON.parse(stored);
      if (
        typeof value === 'object' &&
        value !== null &&
        'userId' in value &&
        'sid' in value &&
        typeof value.userId === 'string' &&
        typeof value.sid === 'string'
      ) {
        return { userId: value.userId, sid: value.sid };
      }
    } catch {
      // Not ours: fall through.
    }
    return null;
  }
}
