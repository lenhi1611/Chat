import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { AccessTokenService } from './access-token.service';
import { AUTH_OPTIONS, type AuthModuleOptions } from './auth.options';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import {
  AUTH_DATABASE_URL,
  AuthPrismaService,
} from './prisma/auth-prisma.service';
import { UsersService } from './users.service';
import { WsTicketService } from './ws-ticket.service';

export interface AuthModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: InjectionToken[];
  useFactory: (
    ...args: never[]
  ) => AuthModuleOptions | Promise<AuthModuleOptions>;
}

/**
 * The auth domain: users, sessions, tokens, WebSocket tickets. Global, so the
 * app registers it once (with its settings) and every module can inject its
 * services. Needs the global RedisModule (@realtime-chat/api-redis).
 */
@Module({})
export class AuthModule {
  static forRootAsync(options: AuthModuleAsyncOptions): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AUTH_OPTIONS,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        {
          provide: AUTH_DATABASE_URL,
          inject: [AUTH_OPTIONS],
          useFactory: (authOptions: AuthModuleOptions) =>
            authOptions.databaseUrl,
        },
        AuthPrismaService,
        PasswordService,
        AccessTokenService,
        UsersService,
        AuthService,
        WsTicketService,
      ],
      exports: [AccessTokenService, AuthService, UsersService, WsTicketService],
    };
  }
}
