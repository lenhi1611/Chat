import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenService } from '@realtime-chat/api-auth';
import { AppError } from '@realtime-chat/contracts';
import type { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC } from './public.decorator';

const BEARER = /^Bearer ([^\s]+)$/i;

/**
 * Global guard (APP_GUARD): every HTTP route needs `Authorization: Bearer
 * <access token>` unless marked @Public(). Other contexts pass through:
 * WebSocket clients authenticate once, with a ticket, during the upgrade.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match) {
      throw new AppError('UNAUTHENTICATED', 'Missing bearer token');
    }
    const claims = await this.accessTokens.verify(match[1]);
    request.auth = { userId: claims.sub, sid: claims.sid };
    return true;
  }
}
