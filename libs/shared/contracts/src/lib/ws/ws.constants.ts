/** Path of the WebSocket endpoint on the api-gateway (same port as HTTP). */
export const WS_PATH = '/ws';

/** Query-string parameter carrying the anonymous client id on connect. */
export const WS_CLIENT_ID_PARAM = 'clientId';

/** Maximum length of a chat message, counted after trimming whitespace. */
export const MAX_TEXT_LENGTH = 2000;
