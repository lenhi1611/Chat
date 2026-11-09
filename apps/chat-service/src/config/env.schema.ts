import { z } from 'zod';

/**
 * What chat-service needs, and nothing else: its database and RabbitMQ.
 * Validated once at startup.
 */
const envObject = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL_CHAT: z.url({ protocol: /^postgres(ql)?$/ }),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** Timeout of this service's RPCs to auth-service (read-through). */
  RPC_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  /** chat.send attempts before the command goes to chat.commands.dlq. */
  CHAT_COMMAND_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
});

export const envSchema = envObject;
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
