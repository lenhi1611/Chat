/*
 * RabbitMQ names shared by the api-gateway, auth-service and chat-service.
 * Queue arguments (dead-lettering, TTL…) live with the topology declaration
 * in libs/api/messaging: one source, so every app asserts identical queues.
 */

/** Topic exchange of every domain event; routing key = event type. */
export const EVENTS_EXCHANGE = 'rtc.events';

export const QUEUES = {
  /** RPC requests to auth-service. */
  authRpc: 'auth.rpc',
  /** RPC requests to chat-service. */
  chatRpc: 'chat.rpc',
  /** Commands to chat-service (`chat.send`). */
  chatCommands: 'chat.commands',
  /** Failed commands wait here (TTL), then go back to `chat.commands`. */
  chatCommandsRetry: 'chat.commands.retry',
  /** Commands that failed every attempt: kept for inspection only. */
  chatCommandsDlq: 'chat.commands.dlq',
  /** chat-service's copy of users (`auth.user.registered`). */
  chatUserSync: 'chat.user-sync',
} as const;

/** One queue per gateway instance: every instance receives every event. */
export const gatewayEventsQueue = (instanceId: string): string =>
  `gateway.events.${instanceId}`;

/** Request–reply patterns (the reply goes to the caller's reply queue). */
export const RPC_PATTERNS = {
  authRegister: 'auth.register',
  authLogin: 'auth.login',
  authRefresh: 'auth.refresh',
  authLogout: 'auth.logout',
  authMe: 'auth.me',
  authWsTicketIssue: 'auth.ws-ticket.issue',
  authWsTicketConsume: 'auth.ws-ticket.consume',
  authUsersSearch: 'auth.users.search',
  authUsersSummaries: 'auth.users.summaries',
  authPing: 'auth.ping',
  chatConversationsList: 'chat.conversations.list',
  chatConversationsCreate: 'chat.conversations.create',
  chatMessagesList: 'chat.messages.list',
  chatPing: 'chat.ping',
} as const;

/** Fire-and-forget work, persisted until a consumer acks it. */
export const COMMAND_PATTERNS = {
  chatSend: 'chat.send',
} as const;

/** Domain event types (routing keys on {@link EVENTS_EXCHANGE}). */
export const DOMAIN_EVENTS = {
  userRegistered: 'auth.user.registered',
  sessionRevoked: 'auth.session.revoked',
  messageCreated: 'chat.message.created',
  messageRejected: 'chat.message.rejected',
  conversationCreated: 'chat.conversation.created',
} as const;

/** The events every gateway instance binds its own queue to. */
export const GATEWAY_EVENT_TYPES = [
  DOMAIN_EVENTS.messageCreated,
  DOMAIN_EVENTS.messageRejected,
  DOMAIN_EVENTS.conversationCreated,
  DOMAIN_EVENTS.sessionRevoked,
] as const;

/** AMQP message headers. */
export const MESSAGING_HEADERS = {
  /** Set by the gateway per HTTP request / chat.send frame; logged everywhere. */
  correlationId: 'x-correlation-id',
} as const;

export const MESSAGING_DEFAULTS = {
  /** RPC timeout, also the request's `expiration`: never handled late. */
  rpcTimeoutMs: 5000,
  /** chat.send attempts before the command goes to the DLQ. */
  chatCommandMaxAttempts: 3,
  /** How long a failed command waits in the retry queue. */
  chatCommandRetryDelayMs: 5000,
} as const;

export type RpcPattern = (typeof RPC_PATTERNS)[keyof typeof RPC_PATTERNS];
export type CommandPattern =
  (typeof COMMAND_PATTERNS)[keyof typeof COMMAND_PATTERNS];
export type DomainEventType =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
