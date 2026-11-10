import { z } from 'zod';

/**
 * Used only outside production when JWT_ACCESS_SECRET is unset, so a fresh
 * checkout runs without setup. Must equal the api-gateway's (it verifies the
 * tokens this service signs). Never deploy with it.
 */
export const DEV_ONLY_JWT_ACCESS_SECRET =
  'dev-only-insecure-jwt-secret-do-not-use-in-production';

const seconds = (defaultValue: number) =>
  z.coerce.number().int().min(1).default(defaultValue);

/**
 * What auth-service needs, and nothing else: its database, Redis (WebSocket
 * tickets), token settings and RabbitMQ. Validated once at startup.
 */
const envObject = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL_AUTH: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** RPC timeout of callers; also bounds this service's publish confirms. */
  RPC_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

  /** HS256 key for access tokens, shared with the api-gateway (it verifies them). */
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL_SECONDS: seconds(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  /** Reuse of a rotated refresh token within this window is not treated as theft. */
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
  WS_TICKET_TTL_SECONDS: seconds(30),
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
