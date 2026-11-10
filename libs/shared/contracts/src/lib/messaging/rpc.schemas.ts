import { z } from 'zod';
import {
  authResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  wsTicketResponseSchema,
} from '../http/auth';
import {
  conversationDtoSchema,
  createConversationRequestSchema,
  listMessagesQuerySchema,
  listMessagesResponseSchema,
} from '../http/conversations';
import { API_ERROR_CODES, validationIssueSchema } from '../http/errors';
import {
  currentUserSchema,
  searchUsersQuerySchema,
  userSummarySchema,
} from '../http/users';
import { RPC_PATTERNS, type RpcPattern } from './messaging.constants';

/*
 * Payloads of every RPC, request and reply. Services validate requests at
 * their edge (as the gateway validates HTTP input): a message on the bus is
 * input like any other. `userId` / `sid` in a request were verified by the
 * gateway from the access token; services trust them (internal network).
 */

/** The caller, as the gateway verified it from the access token. */
const caller = { userId: z.uuid() };

/**
 * A new or refreshed login session. Like the REST `AuthResponse`, plus the
 * raw refresh token: auth-service never sees cookies, the gateway sets them.
 */
export const authSessionSchema = authResponseSchema.extend({
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.iso.datetime(),
  sid: z.uuid(),
});

export const sessionRefSchema = z.object({ userId: z.uuid(), sid: z.uuid() });

/** Health checks: the service answered, and when. */
export const pingResponseSchema = z.object({
  service: z.enum(['auth', 'chat']),
  at: z.iso.datetime(),
});

const empty = z.object({});

/** Request and reply schema of each RPC pattern. */
export const RPC_CONTRACTS = {
  [RPC_PATTERNS.authRegister]: {
    request: registerRequestSchema,
    response: authSessionSchema,
  },
  [RPC_PATTERNS.authLogin]: {
    request: loginRequestSchema,
    response: authSessionSchema,
  },
  [RPC_PATTERNS.authRefresh]: {
    /** Missing when the browser sent no cookie: answered INVALID_REFRESH_TOKEN. */
    request: z.object({ refreshToken: z.string().optional() }),
    response: authSessionSchema,
  },
  [RPC_PATTERNS.authLogout]: {
    request: z.object({ refreshToken: z.string().optional() }),
    /** The session that ended, if the token was known. */
    response: z.object({ session: sessionRefSchema.nullable() }),
  },
  [RPC_PATTERNS.authMe]: {
    request: z.object(caller),
    response: currentUserSchema,
  },
  [RPC_PATTERNS.authWsTicketIssue]: {
    request: sessionRefSchema,
    response: wsTicketResponseSchema,
  },
  [RPC_PATTERNS.authWsTicketConsume]: {
    request: z.object({ ticket: z.string().min(1).max(256) }),
    /** `null`: unknown, expired, already used, or its session is over. */
    response: z.object({ owner: sessionRefSchema.nullable() }),
  },
  [RPC_PATTERNS.authUsersSearch]: {
    request: searchUsersQuerySchema.extend(caller),
    response: z.array(userSummarySchema),
  },
  [RPC_PATTERNS.authUsersSummaries]: {
    request: z.object({ ids: z.array(z.uuid()).max(1000) }),
    response: z.array(userSummarySchema),
  },
  [RPC_PATTERNS.authPing]: { request: empty, response: pingResponseSchema },
  [RPC_PATTERNS.chatConversationsList]: {
    request: z.object(caller),
    response: z.array(conversationDtoSchema),
  },
  [RPC_PATTERNS.chatConversationsCreate]: {
    request: z.object({ ...caller, request: createConversationRequestSchema }),
    /** `created: false`: the DM already existed (HTTP 200 instead of 201). */
    response: z.object({
      conversation: conversationDtoSchema,
      created: z.boolean(),
    }),
  },
  [RPC_PATTERNS.chatMessagesList]: {
    request: listMessagesQuerySchema.extend({
      ...caller,
      conversationId: z.uuid(),
    }),
    response: listMessagesResponseSchema,
  },
  [RPC_PATTERNS.chatPing]: { request: empty, response: pingResponseSchema },
} as const satisfies Record<
  RpcPattern,
  { request: z.ZodType; response: z.ZodType }
>;

/**
 * A failed RPC, as it travels back to the caller: the domain error's code
 * (one of the REST codes, mapped to a status by the gateway), its message and
 * validation details.
 */
export const rpcErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
  details: z.array(validationIssueSchema).optional(),
});

export type RpcContracts = typeof RPC_CONTRACTS;
/** What the caller sends (before defaults / transforms). */
export type RpcRequest<P extends RpcPattern> = z.input<
  RpcContracts[P]['request']
>;
/** What the handler receives once validated. */
export type RpcRequestParsed<P extends RpcPattern> = z.output<
  RpcContracts[P]['request']
>;
export type RpcResponse<P extends RpcPattern> = z.output<
  RpcContracts[P]['response']
>;
export type AuthSessionDto = z.infer<typeof authSessionSchema>;
export type SessionRef = z.infer<typeof sessionRefSchema>;
export type RpcError = z.infer<typeof rpcErrorSchema>;

export function isRpcError(value: unknown): value is RpcError {
  return rpcErrorSchema.safeParse(value).success;
}
