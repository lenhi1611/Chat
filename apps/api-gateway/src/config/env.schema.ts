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
 * Used only outside production when JWT_ACCESS_SECRET is unset, so a fresh
 * checkout runs without setup. Anyone can read it here: never deploy with it.
 */
export const DEV_ONLY_JWT_ACCESS_SECRET =
  'dev-only-insecure-jwt-secret-do-not-use-in-production';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const redisUrl = z.url({ protocol: /^rediss?$/ });
const seconds = (defaultValue: number) =>
  z.coerce.number().int().min(1).default(defaultValue);

/**
 * Environment variables required by the api-gateway.
 * Validated once at startup: the process exits with a readable error when a
 * variable is missing or malformed instead of failing later at runtime.
 */
const envObject = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Browser origins allowed by CORS, with credentials (HTTP only; not WebSocket). */
  CORS_ORIGINS: originList(
    'http://localhost:4200,http://localhost:4201,http://localhost:4202',
  ),

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

  /** auth_db (libs/api/auth) and chat_db (libs/api/chat): one database per domain. */
  DATABASE_URL_AUTH: postgresUrl,
  DATABASE_URL_CHAT: postgresUrl,
  /** WebSocket tickets (single-use, short-lived). */
  REDIS_URL: redisUrl,

  /** HS256 key for access tokens. Required in production (see below). */
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL_SECONDS: seconds(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  /** Reuse of a rotated refresh token within this window is not treated as theft. */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
  WS_TICKET_TTL_SECONDS: seconds(30),
  /** Adds `Secure` to the refresh-token cookie (set true behind HTTPS). */
  COOKIE_SECURE: z.stringbool().default(false),
});

export const envSchema = envObject
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'is required when NODE_ENV=production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? DEV_ONLY_JWT_ACCESS_SECRET,
  }));

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
