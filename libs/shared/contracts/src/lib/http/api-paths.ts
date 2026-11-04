/** Global prefix of every HTTP route exposed by the api-gateway. */
export const API_GLOBAL_PREFIX = 'api';

/** HTTP route segments (relative to {@link API_GLOBAL_PREFIX}). */
export const API_PATHS = {
  health: 'health',
} as const;
