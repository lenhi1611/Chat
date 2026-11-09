import { Injectable } from '@nestjs/common';
import { UsersService } from '@realtime-chat/api-auth';
import type { UserSource } from '@realtime-chat/api-chat';
import type { UserSummary } from '@realtime-chat/contracts';

/**
 * The chat domain's user source, over the auth library in-process. Only while
 * this app still runs both domains itself; chat-service asks auth-service
 * over RabbitMQ instead. Removed when the gateway stops using the libraries.
 */
@Injectable()
export class AuthUsersAdapter implements UserSource {
  constructor(private readonly users: UsersService) {}

  findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    return this.users.findSummariesByIds(ids);
  }
}
