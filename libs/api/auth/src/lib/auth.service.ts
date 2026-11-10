import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from '@realtime-chat/api-messaging';
import {
  AppError,
  type CurrentUser,
  createDomainEvent,
  DOMAIN_EVENTS,
  type LoginRequest,
  type RegisterRequest,
} from '@realtime-chat/contracts';
import type { User } from '../generated/prisma/client';
import { AccessTokenService } from './access-token.service';
import { AUTH_OPTIONS, type AuthModuleOptions } from './auth.options';
import { PasswordService } from './password.service';
import { AuthPrismaService } from './prisma/auth-prisma.service';
import { generateOpaqueToken, hashToken } from './refresh-token';
import { toCurrentUser } from './user.mapper';
import { UsersService } from './users.service';

/** Everything the HTTP layer needs after register, login or refresh. */
export interface AuthSession {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /** Raw refresh token: goes into the cookie, never into the database. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  /** Login session id (= refresh-token family id, `sid` claim). */
  sid: string;
  user: CurrentUser;
}

/** The login session a refresh token belonged to. */
export interface EndedSession {
  userId: string;
  sid: string;
}

const invalidRefreshToken = () =>
  new AppError(
    'INVALID_REFRESH_TOKEN',
    'Session expired, please sign in again',
  );

/** Thrown inside the rotation transaction to roll it back. */
class AlreadyRotated extends Error {}

/**
 * Sessions = refresh-token families. Each refresh rotates the token: the old
 * row is revoked and points to its replacement. Presenting a revoked token
 * again means it was copied (theft) unless it happens within a short grace
 * window after its rotation (two tabs refreshing at once, a lost response).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    private readonly prisma: AuthPrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    /** Provided by the app (auth-service: RabbitMQ). */
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  /**
   * Creates the user, announces it (`auth.user.registered`), then opens a
   * session. The user row and the event are two writes (no outbox): if the
   * event cannot be published, the call fails with SERVICE_UNAVAILABLE but the
   * user exists; chat-service still learns about it by read-through.
   * @throws AppError EMAIL_TAKEN, USERNAME_TAKEN or SERVICE_UNAVAILABLE
   */
  async register(
    input: RegisterRequest,
    correlationId: string = randomUUID(),
  ): Promise<AuthSession> {
    const user = await this.users.create({
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash: await this.passwords.hash(input.password),
    });
    this.logger.log(
      `Registered user ${user.id} [correlationId=${correlationId}]`,
    );
    await this.events.publish(
      createDomainEvent(
        DOMAIN_EVENTS.userRegistered,
        {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        correlationId,
      ),
    );
    return this.startSession(user);
  }

  /**
   * Unknown email and wrong password give the same error and take the same
   * time (a hash is verified either way).
   * @throws AppError INVALID_CREDENTIALS
   */
  async login(input: LoginRequest): Promise<AuthSession> {
    const user = await this.users.findByEmail(input.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);
    if (!user || !valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return this.startSession(user);
  }

  /** @throws AppError INVALID_REFRESH_TOKEN */
  async refresh(
    rawToken: string | undefined,
    correlationId: string = randomUUID(),
  ): Promise<AuthSession> {
    if (!rawToken) throw invalidRefreshToken();
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!current) throw invalidRefreshToken();

    const now = new Date();
    if (current.revokedAt) {
      const sinceRevoked = (now.getTime() - current.revokedAt.getTime()) / 1000;
      const benignRace =
        current.replacedById !== null &&
        sinceRevoked <= this.options.refreshReuseGraceSeconds;
      if (!benignRace) {
        await this.revokeFamily(current.familyId, now);
        this.logger.warn(
          `Refresh token reuse detected: session ${current.familyId} of user ${current.userId} revoked`,
        );
        await this.sessionEnded(
          { userId: current.userId, sid: current.familyId },
          correlationId,
          // The caller gets INVALID_REFRESH_TOKEN either way: a failed
          // announcement must not turn a refused theft into a "retry later".
          { swallowPublishError: true },
        );
      }
      throw invalidRefreshToken();
    }
    if (current.expiresAt <= now) throw invalidRefreshToken();

    const user = await this.users.findById(current.userId);
    if (!user) throw invalidRefreshToken();

    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = this.refreshExpiry(now);
    try {
      await this.prisma.$transaction(async (tx) => {
        const next = await tx.refreshToken.create({
          data: {
            userId: current.userId,
            familyId: current.familyId,
            tokenHash: hashToken(refreshToken),
            expiresAt: refreshTokenExpiresAt,
          },
        });
        // Only one concurrent refresh may rotate a given token.
        const { count } = await tx.refreshToken.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now, replacedById: next.id },
        });
        if (count !== 1) throw new AlreadyRotated();
      });
    } catch (error) {
      // Lost the race to another request with the same token: same answer
      // as a reuse within the grace window, and the session stays alive.
      if (error instanceof AlreadyRotated) throw invalidRefreshToken();
      throw error;
    }

    return this.sessionResponse(
      user,
      current.familyId,
      refreshToken,
      refreshTokenExpiresAt,
    );
  }

  /**
   * Revokes the whole session of `rawToken`. Unknown or missing token: no-op
   * (logout must always succeed). Returns the ended session, if any.
   */
  async logout(
    rawToken: string | undefined,
    correlationId: string = randomUUID(),
  ): Promise<EndedSession | null> {
    if (!rawToken) return null;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!token) return null;
    await this.revokeFamily(token.familyId, new Date());
    const session = { userId: token.userId, sid: token.familyId };
    await this.sessionEnded(session, correlationId);
    return session;
  }

  /**
   * A session is live while it has a refresh token that is neither revoked
   * nor expired (logout and reuse detection revoke all of them).
   */
  async isSessionActive(sid: string): Promise<boolean> {
    const live = await this.prisma.refreshToken.findFirst({
      where: { familyId: sid, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return live !== null;
  }

  /** @throws AppError UNAUTHENTICATED when the user no longer exists */
  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Unknown user');
    return toCurrentUser(user);
  }

  private async startSession(user: User): Promise<AuthSession> {
    const sid = randomUUID();
    const refreshToken = generateOpaqueToken();
    const refreshTokenExpiresAt = this.refreshExpiry(new Date());
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: sid,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
    });
    return this.sessionResponse(user, sid, refreshToken, refreshTokenExpiresAt);
  }

  private async sessionResponse(
    user: User,
    sid: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<AuthSession> {
    return {
      accessToken: await this.accessTokens.sign({ sub: user.id, sid }),
      expiresIn: this.accessTokens.ttlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
      sid,
      user: toCurrentUser(user),
    };
  }

  private refreshExpiry(from: Date): Date {
    return new Date(
      from.getTime() + this.options.refreshTokenTtlDays * 86_400_000,
    );
  }

  /**
   * `auth.session.revoked`: every gateway closes the session's sockets (4401).
   * Idempotent for them: reuse of another token of an already revoked
   * session announces it again.
   */
  private async sessionEnded(
    session: EndedSession,
    correlationId: string,
    { swallowPublishError = false } = {},
  ): Promise<void> {
    try {
      await this.events.publish(
        createDomainEvent(DOMAIN_EVENTS.sessionRevoked, session, correlationId),
      );
    } catch (error) {
      if (!swallowPublishError) throw error;
      this.logger.error(
        `Could not announce the end of session ${session.sid} [correlationId=${correlationId}]: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
