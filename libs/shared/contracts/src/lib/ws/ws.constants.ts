/** Path of the WebSocket endpoint on the api-gateway (same port as HTTP). */
export const WS_PATH = '/ws';

/** Query-string parameter carrying the single-use ticket on connect. */
export const WS_TICKET_PARAM = 'ticket';

/** Application close codes (4000–4999 are free for applications, RFC 6455). */
export const WS_CLOSE_CODES = {
  /** The login session ended (logout, or revoked): do not reconnect. */
  sessionEnded: 4401,
} as const;

/** Maximum length of a chat message, counted after trimming whitespace. */
export const MAX_TEXT_LENGTH = 2000;
