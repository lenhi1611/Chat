// Public API of @realtime-chat/api-auth: users, sessions, tokens, WS tickets.
// Prisma and the token internals stay private to the auth domain.
export { AuthModule, type AuthModuleAsyncOptions } from './lib/auth.module';
export type { AuthModuleOptions } from './lib/auth.options';
export {
  AccessTokenService,
  type AccessTokenClaims,
} from './lib/access-token.service';
export {
  AuthService,
  type AuthSession,
  type EndedSession,
} from './lib/auth.service';
export { UsersService } from './lib/users.service';
export { WsTicketService, type WsTicketOwner } from './lib/ws-ticket.service';
