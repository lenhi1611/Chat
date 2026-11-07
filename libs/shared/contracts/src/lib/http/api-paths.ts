/** Global prefix of every HTTP route exposed by the api-gateway. */
export const API_GLOBAL_PREFIX = 'api';

/** HTTP route segments (relative to {@link API_GLOBAL_PREFIX}). */
export const API_PATHS = {
  health: 'health',
  auth: {
    register: 'auth/register',
    login: 'auth/login',
    refresh: 'auth/refresh',
    logout: 'auth/logout',
    me: 'auth/me',
    wsTicket: 'auth/ws-ticket',
  },
  users: {
    search: 'users/search',
  },
  conversations: 'conversations',
  /** `conversations/:id/messages` */
  conversationMessages: (conversationId: string) =>
    `conversations/${encodeURIComponent(conversationId)}/messages`,
} as const;

/**
 * Refresh-token cookie. Scoped to the auth routes so the browser sends it to
 * `/api/auth/*` only (refresh, logout), never to the rest of the API.
 */
export const REFRESH_COOKIE = {
  name: 'refresh_token',
  path: `/${API_GLOBAL_PREFIX}/auth`,
} as const;
