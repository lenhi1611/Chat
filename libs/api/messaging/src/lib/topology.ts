import {
  DOMAIN_EVENTS,
  EVENTS_EXCHANGE,
  gatewayEventsQueue,
  MESSAGING_DEFAULTS,
  QUEUES,
} from '@realtime-chat/contracts';
import type { Channel, ConsumeMessage, Options } from 'amqplib';

/**
 * The one definition of the RabbitMQ topology. Every app declares it at
 * startup (and after each reconnect), and every Nest RMQ server / client that
 * asserts one of these queues gets its arguments from {@link queueOptions}:
 * a queue asserted twice with different arguments fails with
 * PRECONDITION_FAILED and closes the channel.
 *
 * ```
 *  rtc.events (topic) ──auth.user.registered──▶ chat.user-sync
 *                     ──chat.message.* …────────▶ gateway.events.<instance> (per gateway, exclusive)
 *
 *  chat.commands ──nack──▶ (default exchange) ──▶ chat.commands.retry (TTL)
 *        ▲                                              │ expires
 *        └────────────────(default exchange)◀───────────┘
 *  after the last attempt the consumer moves it to chat.commands.dlq
 * ```
 */
export interface TopologyNames {
  exchange: string;
  authRpc: string;
  chatRpc: string;
  chatCommands: string;
  chatCommandsRetry: string;
  chatCommandsDlq: string;
  chatUserSync: string;
}

export type QueueKey = Exclude<keyof TopologyNames, 'exchange'>;

/** `prefix` isolates integration tests on a shared broker; apps use none. */
export function topologyNames(prefix = ''): TopologyNames {
  return {
    exchange: `${prefix}${EVENTS_EXCHANGE}`,
    authRpc: `${prefix}${QUEUES.authRpc}`,
    chatRpc: `${prefix}${QUEUES.chatRpc}`,
    chatCommands: `${prefix}${QUEUES.chatCommands}`,
    chatCommandsRetry: `${prefix}${QUEUES.chatCommandsRetry}`,
    chatCommandsDlq: `${prefix}${QUEUES.chatCommandsDlq}`,
    chatUserSync: `${prefix}${QUEUES.chatUserSync}`,
  };
}

/**
 * `gateway.events.<instanceId>`, with the same prefix as the other names
 * (tests). Not part of the shared topology: each gateway declares its own.
 */
export function gatewayEventsQueueName(
  { names }: TopologySettings,
  instanceId: string,
): string {
  const prefix = names.authRpc.slice(0, -QUEUES.authRpc.length);
  return `${prefix}${gatewayEventsQueue(instanceId)}`;
}

export interface TopologySettings {
  names: TopologyNames;
  /** How long a failed command waits before its next attempt. */
  retryDelayMs: number;
}

export const defaultTopology = (): TopologySettings => ({
  names: topologyNames(),
  retryDelayMs: MESSAGING_DEFAULTS.chatCommandRetryDelayMs,
});

/** Same as what Nest's RMQ transport asserts: topic, durable, no arguments. */
export const EXCHANGE_OPTIONS: Options.AssertExchange = { durable: true };

/** Arguments of each durable queue. Must be identical in every app. */
export function queueOptions(
  { names, retryDelayMs }: TopologySettings,
  queue: QueueKey,
): Options.AssertQueue {
  switch (queue) {
    case 'chatCommands':
      // nack without requeue → the retry queue, through the default exchange.
      return {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': names.chatCommandsRetry,
        },
      };
    case 'chatCommandsRetry':
      // Nobody consumes it: the TTL expires and sends the message back.
      return {
        durable: true,
        arguments: {
          'x-message-ttl': retryDelayMs,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': names.chatCommands,
        },
      };
    default:
      return { durable: true };
  }
}

/**
 * A gateway instance's own events queue: it lives as long as the instance's
 * connection (exclusive, auto-delete), so it is declared by that connection,
 * again after every reconnect (a broker restart deletes it).
 */
export const INSTANCE_QUEUE_OPTIONS: Options.AssertQueue = {
  durable: false,
  exclusive: true,
  autoDelete: true,
};

const QUEUE_KEYS: QueueKey[] = [
  'authRpc',
  'chatRpc',
  'chatCommands',
  'chatCommandsRetry',
  'chatCommandsDlq',
  'chatUserSync',
];

/** Idempotent: asserting what already exists with the same arguments is a no-op. */
export async function declareTopology(
  channel: Pick<Channel, 'assertExchange' | 'assertQueue' | 'bindQueue'>,
  settings: TopologySettings,
): Promise<void> {
  const { names } = settings;
  await channel.assertExchange(names.exchange, 'topic', EXCHANGE_OPTIONS);
  for (const key of QUEUE_KEYS) {
    await channel.assertQueue(names[key], queueOptions(settings, key));
  }
  await channel.bindQueue(
    names.chatUserSync,
    names.exchange,
    DOMAIN_EVENTS.userRegistered,
  );
}

/**
 * Which attempt this delivery of a command is (1 for the first). RabbitMQ
 * counts each dead-lettering in the `x-death` header, per queue and reason;
 * every nack from `queue` added one "rejected" there.
 */
export function deliveryAttempt(
  message: Pick<ConsumeMessage, 'properties'>,
  queue: string,
): number {
  const deaths = message.properties.headers?.['x-death'] as
    { queue?: string; reason?: string; count?: number }[] | undefined;
  const rejected = deaths?.find(
    (death) => death.queue === queue && death.reason === 'rejected',
  );
  return (rejected?.count ?? 0) + 1;
}
