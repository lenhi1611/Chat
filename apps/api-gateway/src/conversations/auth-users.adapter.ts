import { Injectable } from '@nestjs/common';
import { UsersService } from '@realtime-chat/api-auth';
import type { UsersPort } from '@realtime-chat/api-chat';
import type { UserSummary } from '@realtime-chat/contracts';

/**
 * The chat domain's USERS_PORT, implemented over the auth domain. This app is
 * the only place allowed to import both (lint keeps the domains apart); in
 * phase 3 this becomes an RPC call to auth-service.
 */
@Injectable()
export class AuthUsersAdapter implements UsersPort {
  constructor(private readonly users: UsersService) {}

  findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    return this.users.findSummariesByIds(ids);
  }

  exists(id: string): Promise<boolean> {
    return this.users.exists(id);
  }
}
