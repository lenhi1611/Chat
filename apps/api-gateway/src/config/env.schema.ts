import { WS_PATH } from '@realtime-chat/contracts';
import { z } from 'zod';

/** Comma-separated list of browser origins, e.g. "http://a:1,http://b:2". */
const originList = (defaultValue: string) =>
  z
    .string()
    .min(1)
    .default(defaultValue)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1));

/**
 * Environment variables required by the api-gateway.
 * Validated once at startup: the process exits with a readable error when a
 * variable is missing or malformed instead of failing later at runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Browser origins allowed by CORS (HTTP only; does not apply to WebSocket). */
  CORS_ORIGINS: originList('http://localhost:4200'),

  /** Path of the WebSocket endpoint, served on the same port as HTTP. */
  WS_PATH: z
    .string()
    .regex(/^\/[\w\-/]*$/, 'must start with "/"')
    .default(WS_PATH),
  /**
   * Origins allowed to open a WebSocket. Checked during the upgrade request:
   * browsers do not apply CORS to WebSocket, so this is the only origin check.
   */
  WS_ALLOWED_ORIGINS: originList('http://localhost:4200,http://localhost:4202'),
  /** Ping interval; a client that misses one pong is terminated. */
  WS_HEARTBEAT_MS: z.coerce.number().int().min(10).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
