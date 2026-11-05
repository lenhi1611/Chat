import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AppError } from '@realtime-chat/contracts';
import { AUTH_OPTIONS, type AuthModuleOptions } from './auth.options';

/** What an access token says: who (`sub`) and which login session (`sid`). */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id = refresh-token family id. */
  sid: string;
}

const ALGORITHM = 'HS256';

/**
 * Short-lived JWT access tokens (HS256). Verification pins the algorithm, so
 * `alg: none` or a token signed with another algorithm is rejected even when
 * the signature would otherwise check out.
 */
@Injectable()
export class AccessTokenService {
  private readonly jwt: JwtService;

  constructor(
    @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
  ) {
    this.jwt = new JwtService({ secret: options.jwtAccessSecret });
  }

  get ttlSeconds(): number {
    return this.options.accessTokenTtlSeconds;
  }

  sign(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.sub, sid: claims.sid },
      { algorithm: ALGORITHM, expiresIn: this.options.accessTokenTtlSeconds },
    );
  }

  /** @throws AppError TOKEN_EXPIRED or UNAUTHENTICATED */
  async verify(token: string): Promise<AccessTokenClaims> {
    let payload: Partial<Record<keyof AccessTokenClaims, unknown>>;
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
    return { sub: payload.sub, sid: payload.sid };
  }
}
