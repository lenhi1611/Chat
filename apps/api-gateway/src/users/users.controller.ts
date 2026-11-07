import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from '@realtime-chat/api-auth';
import {
  type SearchUsersQuery,
  searchUsersQuerySchema,
  type UserSummary,
} from '@realtime-chat/contracts';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Prefix search on username (excluding the caller), at most 10 results. */
  @Get('search')
  search(
    @Query(new ZodValidationPipe(searchUsersQuerySchema))
    query: SearchUsersQuery,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UserSummary[]> {
    return this.users.searchByUsernamePrefix(query.q, caller.userId);
  }
}
