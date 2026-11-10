import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { RpcClient } from '@realtime-chat/api-messaging';
import {
  RPC_PATTERNS,
  type SearchUsersQuery,
  searchUsersQuerySchema,
  type UserSummary,
} from '@realtime-chat/contracts';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../auth/current-user.decorator';
import { CorrelationId } from '../http/correlation-id';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { AUTH_RPC } from '../messaging/service-clients.module';

@Controller('users')
export class UsersController {
  constructor(@Inject(AUTH_RPC) private readonly auth: RpcClient) {}

  /** Prefix search on username (excluding the caller), at most 10 results. */
  @Get('search')
  search(
    @Query(new ZodValidationPipe(searchUsersQuerySchema))
    query: SearchUsersQuery,
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<UserSummary[]> {
    return this.auth.call(
      RPC_PATTERNS.authUsersSearch,
      { userId: caller.userId, q: query.q },
      correlationId,
    );
  }
}
