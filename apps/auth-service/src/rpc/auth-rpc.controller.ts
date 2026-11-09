import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import {
  type AuthSession,
  AuthService,
  UsersService,
  WsTicketService,
} from '@realtime-chat/api-auth';
import { handleRpc } from '@realtime-chat/api-messaging';
import {
  AppError,
  type AuthSessionDto,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';

const toDto = (session: AuthSession): AuthSessionDto => ({
  ...session,
  refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
});

/**
 * The RabbitMQ adapter of the auth domain: one handler per `auth.*` RPC. It
 * only translates (validation and errors via handleRpc); the rules live in
 * libs/api/auth.
 */
@Controller()
export class AuthRpcController {
  private readonly logger = new Logger(AuthRpcController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly tickets: WsTicketService,
  ) {}

  @MessagePattern(RPC_PATTERNS.authRegister)
  register(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authRegister,
      data,
      context,
      this.logger,
      async (request, { correlationId }) =>
        toDto(await this.auth.register(request, correlationId)),
    );
  }

  @MessagePattern(RPC_PATTERNS.authLogin)
  login(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authLogin,
      data,
      context,
      this.logger,
      async (request) => toDto(await this.auth.login(request)),
    );
  }

  @MessagePattern(RPC_PATTERNS.authRefresh)
  refresh(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authRefresh,
      data,
      context,
      this.logger,
      async ({ refreshToken }, { correlationId }) =>
        toDto(await this.auth.refresh(refreshToken, correlationId)),
    );
  }

  @MessagePattern(RPC_PATTERNS.authLogout)
  logout(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authLogout,
      data,
      context,
      this.logger,
      async ({ refreshToken }, { correlationId }) => ({
        session: await this.auth.logout(refreshToken, correlationId),
      }),
    );
  }

  @MessagePattern(RPC_PATTERNS.authMe)
  me(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authMe,
      data,
      context,
      this.logger,
      ({ userId }) => this.auth.currentUser(userId),
    );
  }

  /** Only for a live session: a revoked or expired one gets no new socket. */
  @MessagePattern(RPC_PATTERNS.authWsTicketIssue)
  issueTicket(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authWsTicketIssue,
      data,
      context,
      this.logger,
      async (owner) => {
        if (!(await this.auth.isSessionActive(owner.sid))) {
          throw new AppError('UNAUTHENTICATED', 'Session ended');
        }
        return this.tickets.issue(owner);
      },
    );
  }

  /**
   * Single use (GETDEL), and checked again: the session may have ended
   * between issue and use.
   */
  @MessagePattern(RPC_PATTERNS.authWsTicketConsume)
  consumeTicket(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authWsTicketConsume,
      data,
      context,
      this.logger,
      async ({ ticket }) => {
        const owner = await this.tickets.consume(ticket);
        const live =
          owner !== null && (await this.auth.isSessionActive(owner.sid));
        return { owner: live ? owner : null };
      },
    );
  }

  @MessagePattern(RPC_PATTERNS.authUsersSearch)
  searchUsers(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authUsersSearch,
      data,
      context,
      this.logger,
      ({ q, userId }) => this.users.searchByUsernamePrefix(q, userId),
    );
  }

  @MessagePattern(RPC_PATTERNS.authUsersSummaries)
  summaries(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authUsersSummaries,
      data,
      context,
      this.logger,
      ({ ids }) => this.users.findSummariesByIds(ids),
    );
  }

  @MessagePattern(RPC_PATTERNS.authPing)
  ping(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authPing,
      data,
      context,
      this.logger,
      async () => ({
        service: 'auth' as const,
        at: new Date().toISOString(),
      }),
    );
  }
}
