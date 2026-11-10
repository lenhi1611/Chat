import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AppError } from '@realtime-chat/contracts';
import type { Env } from '../config/env.schema';
import type { AuthenticatedUser } from './current-user.decorator';

const ALGORITHM = 'HS256';

/**
 * Verifies access tokens here, without asking auth-service: a request costs no
 * RPC. auth-service signs with the same HS256 secret (JWT_ACCESS_SECRET).
 * The algorithm is pinned: `alg: none` or another algorithm is rejected.
 */
@Injectable()
export class AccessTokenVerifier {
  private readonly jwt: JwtService;

  constructor(config: ConfigService<Env, true>) {
    this.jwt = new JwtService({
      secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /** @throws AppError TOKEN_EXPIRED or UNAUTHENTICATED */
  async verify(token: string): Promise<AuthenticatedUser> {
    let payload: { sub?: unknown; sid?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: [ALGORITHM] });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new AppError('TOKEN_EXPIRED', 'Access token has expired');
      }
      throw new AppError('UNAUTHENTICATED', 'Invalid access token');
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'Invalid access token');
    }
    return { userId: payload.sub, sid: payload.sid };
  }
}
