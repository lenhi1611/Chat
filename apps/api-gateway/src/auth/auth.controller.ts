import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RpcClient } from '@realtime-chat/api-messaging';
import {
  type AuthResponse,
  type AuthSessionDto,
  type CurrentUser as CurrentUserDto,
  loginRequestSchema,
  type LoginRequest,
  registerRequestSchema,
  type RegisterRequest,
  RPC_PATTERNS,
  type WsTicketResponse,
} from '@realtime-chat/contracts';
import type { Request, Response } from 'express';
import { ChatRealtimeService } from '../chat/chat-realtime.service';
import type { Env } from '../config/env.schema';
import { CorrelationId } from '../http/correlation-id';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { AUTH_RPC } from '../messaging/service-clients.module';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

/**
 * Thin HTTP edge over auth-service (RPC over RabbitMQ): validation, cookies,
 * status codes. The service never sees cookies: it gets and returns the raw
 * refresh token, and this controller moves it in and out of the cookie.
 */
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    @Inject(AUTH_RPC) private readonly auth: RpcClient,
    private readonly realtime: ChatRealtimeService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookie = config.get('COOKIE_SECURE', { infer: true });
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.call(
      RPC_PATTERNS.authRegister,
      body,
      correlationId,
    );
    return this.respond(session, response);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.call(
      RPC_PATTERNS.authLogin,
      body,
      correlationId,
    );
    return this.respond(session, response);
  }

  /** Authenticated by the refresh cookie, not by a Bearer token. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    let session: AuthSessionDto;
    try {
      session = await this.auth.call(
        RPC_PATTERNS.authRefresh,
        { refreshToken: readRefreshCookie(request) },
        correlationId,
      );
    } catch (error) {
      // A dead refresh token is useless: drop it from the browser too. Not
      // when the service is unreachable: the token may still be good.
      if (!isUnavailable(error))
        clearRefreshCookie(response, this.secureCookie);
      throw error;
    }
    return this.respond(session, response);
  }

  /**
   * Revokes the cookie's session (if any) and clears the cookie. The cookie
   * is cleared even if auth-service cannot be reached (the user asked to
   * leave); the error is still reported.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    clearRefreshCookie(response, this.secureCookie);
    const { session } = await this.auth.call(
      RPC_PATTERNS.authLogout,
      { refreshToken: readRefreshCookie(request) },
      correlationId,
    );
    // Until this gateway consumes auth.session.revoked (step 7).
    if (session) this.realtime.sessionEnded(session.sid);
  }

  @Get('me')
  me(
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<CurrentUserDto> {
    return this.auth.call(
      RPC_PATTERNS.authMe,
      { userId: caller.userId },
      correlationId,
    );
  }

  @Post('ws-ticket')
  @HttpCode(HttpStatus.OK)
  wsTicket(
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<WsTicketResponse> {
    return this.auth.call(
      RPC_PATTERNS.authWsTicketIssue,
      { userId: caller.userId, sid: caller.sid },
      correlationId,
    );
  }

  private respond(session: AuthSessionDto, response: Response): AuthResponse {
    setRefreshCookie(
      response,
      session.refreshToken,
      new Date(session.refreshTokenExpiresAt),
      this.secureCookie,
    );
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }
}

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'SERVICE_UNAVAILABLE';
