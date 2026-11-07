import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthService,
  type AuthSession,
  WsTicketService,
} from '@realtime-chat/api-auth';
import {
  type AuthResponse,
  type CurrentUser as CurrentUserDto,
  loginRequestSchema,
  type LoginRequest,
  registerRequestSchema,
  type RegisterRequest,
  type WsTicketResponse,
} from '@realtime-chat/contracts';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

/**
 * Thin HTTP edge over the auth domain: validation, cookies, status codes.
 * All rules live in AuthService (libs/api/auth).
 */
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly wsTickets: WsTicketService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookie = config.get('COOKIE_SECURE', { infer: true });
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.register(body), response);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.login(body), response);
  }

  /** Authenticated by the refresh cookie, not by a Bearer token. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(
        await this.auth.refresh(readRefreshCookie(request)),
        response,
      );
    } catch (error) {
      // A dead refresh token is useless: drop it from the browser too.
      clearRefreshCookie(response, this.secureCookie);
      throw error;
    }
  }

  /** Always succeeds: revokes the cookie's session (if any) and clears it. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response, this.secureCookie);
  }

  @Get('me')
  me(@CurrentUser() caller: AuthenticatedUser): Promise<CurrentUserDto> {
    return this.auth.currentUser(caller.userId);
  }

  @Post('ws-ticket')
  @HttpCode(HttpStatus.OK)
  wsTicket(
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<WsTicketResponse> {
    return this.wsTickets.issue({ userId: caller.userId, sid: caller.sid });
  }

  private respond(session: AuthSession, response: Response): AuthResponse {
    setRefreshCookie(
      response,
      session.refreshToken,
      session.refreshTokenExpiresAt,
      this.secureCookie,
    );
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }
}
