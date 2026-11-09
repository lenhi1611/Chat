import type { Logger } from '@nestjs/common';
import {
  type RmqContext,
  type RmqOptions,
  Transport,
} from '@nestjs/microservices';
import {
  type DomainEvent,
  MESSAGING_HEADERS,
  parseDomainEvent,
  type SystemErrorCode,
} from '@realtime-chat/contracts';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { z } from 'zod';
import type { MessagingConnection } from './connection';
import { correlationIdOf } from './rpc';
import {
  deliveryAttempt,
  INSTANCE_QUEUE_OPTIONS,
  queueOptions,
  type TopologySettings,
} from './topology';

// --- graceful shutdown -----------------------------------------------------------

/**
 * Handlers currently running, so shutdown can wait for them. Once draining,
 * new deliveries are handed back to the broker (nack + requeue) untouched:
 * another instance, or this one after a restart, takes them.
 */
export class InflightTracker {
  private readonly running = new Set<Promise<unknown>>();
  private stopping = false;

  get draining(): boolean {
    return this.stopping;
  }

  track<T>(work: Promise<T>): Promise<T> {
    this.running.add(work);
    void work.finally(() => this.running.delete(work)).catch(() => undefined);
    return work;
  }

  /** Stop taking work, then wait (at most `timeoutMs`) for what is running. */
  async drain(timeoutMs: number): Promise<void> {
    this.stopping = true;
    if (this.running.size === 0) return;
    await Promise.race([
      Promise.allSettled([...this.running]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
}

const channelOf = (context: RmqContext) => context.getChannelRef() as Channel;
const messageOf = (context: RmqContext) =>
  context.getMessage() as ConsumeMessage;

// --- events ------------------------------------------------------------------------

export interface EventConsumerDeps {
  tracker: InflightTracker;
  logger: Logger;
}

/**
 * Handles one event with manual ack:
 * - invalid envelope → logged and dropped (nack, no requeue): retrying a
 *   malformed message can never succeed, and it must not block the queue;
 * - handler done → ack; handler failed → logged, nack without requeue.
 *   Events are notifications: a consumer that needs more (chat.user-sync) can
 *   recover what it missed another way (read-through).
 */
export async function consumeEvent(
  context: RmqContext,
  raw: unknown,
  { tracker, logger }: EventConsumerDeps,
  handler: (event: DomainEvent) => Promise<void> | void,
): Promise<void> {
  const channel = channelOf(context);
  const message = messageOf(context);
  if (tracker.draining) {
    channel.nack(message, false, true);
    return;
  }
  const parsed = parseDomainEvent(raw);
  if (!parsed.ok) {
    logger.warn(`Dropped an invalid event: ${parsed.error}`);
    channel.nack(message, false, false);
    return;
  }
  await tracker.track(
    (async () => {
      try {
        await handler(parsed.event);
        channel.ack(message);
      } catch (error) {
        logger.error(
          `${parsed.event.type} handler failed [correlationId=${parsed.event.correlationId}]: ${error instanceof Error ? error.message : error}`,
        );
        channel.nack(message, false, false);
      }
    })(),
  );
}

// --- commands ----------------------------------------------------------------------

/**
 * A command that can never succeed (not a member, invalid payload…): the
 * sender is told (`rejected`), the command is acked, no retry.
 */
export class PermanentCommandError extends Error {
  constructor(
    readonly code: SystemErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PermanentCommandError';
  }
}

export interface CommandConsumerDeps<T> {
  schema: z.ZodType<T>;
  /** Name of the queue being consumed (for the attempt count). */
  queue: string;
  dlq: string;
  maxAttempts: number;
  connection: MessagingConnection;
  tracker: InflightTracker;
  logger: Logger;
  /** Does the work, including publishing its outcome event. */
  handle: (command: T, meta: { correlationId: string }) => Promise<void>;
  /**
   * Tells the sender it failed for good. `command` is what could be read of
   * the message (the payload may be invalid). Must publish before resolving.
   */
  reject: (
    command: unknown,
    code: SystemErrorCode,
    message: string,
    meta: { correlationId: string },
  ) => Promise<void>;
}

/**
 * At-least-once command handling with manual ack:
 *
 * - success → ack;
 * - permanent failure (invalid payload, PermanentCommandError) → `reject`,
 *   then ack: no retry;
 * - transient failure → nack without requeue: the queue dead-letters it to
 *   the retry queue, which sends it back after its TTL;
 * - transient failure on the last attempt → copy to the DLQ, `reject` with
 *   SEND_FAILED, then ack.
 *
 * If telling the sender itself fails (broker down), the message is nacked
 * and comes back: nothing is acked before its outcome is published. The
 * handler must therefore be idempotent (a redelivery after a crash between
 * "stored" and "acked" runs it again).
 */
export async function consumeCommand<T>(
  context: RmqContext,
  raw: unknown,
  deps: CommandConsumerDeps<T>,
): Promise<void> {
  const channel = channelOf(context);
  const message = messageOf(context);
  if (deps.tracker.draining) {
    channel.nack(message, false, true);
    return;
  }
  const correlationId = correlationIdOf(context);
  const meta = { correlationId };
  const attempt = deliveryAttempt(message, deps.queue);

  await deps.tracker.track(
    (async () => {
      try {
        const parsed = deps.schema.safeParse(raw);
        if (!parsed.success) {
          await deps.reject(raw, 'INVALID_PAYLOAD', 'Invalid message', meta);
        } else {
          try {
            await deps.handle(parsed.data, meta);
          } catch (error) {
            if (!(error instanceof PermanentCommandError)) throw error;
            await deps.reject(parsed.data, error.code, error.message, meta);
          }
        }
        channel.ack(message);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt < deps.maxAttempts) {
          deps.logger.warn(
            `Command failed (attempt ${attempt}/${deps.maxAttempts}), will retry [correlationId=${correlationId}]: ${reason}`,
          );
          channel.nack(message, false, false);
          return;
        }
        await exhausted(message, raw, attempt, reason, deps, meta).then(
          () => channel.ack(message),
          (failure: unknown) => {
            deps.logger.error(
              `Could not dead-letter a command, it will come back [correlationId=${correlationId}]: ${failure instanceof Error ? failure.message : failure}`,
            );
            channel.nack(message, false, false);
          },
        );
      }
    })(),
  );
}

async function exhausted<T>(
  message: ConsumeMessage,
  raw: unknown,
  attempt: number,
  reason: string,
  deps: CommandConsumerDeps<T>,
  meta: { correlationId: string },
): Promise<void> {
  deps.logger.error(
    `Command failed ${attempt} times, moved to ${deps.dlq} [correlationId=${meta.correlationId}]: ${reason}`,
  );
  await deps.connection.sendToQueue(deps.dlq, message.content, {
    correlationId: meta.correlationId,
    headers: {
      ...message.properties.headers,
      [MESSAGING_HEADERS.correlationId]: meta.correlationId,
      'x-failure-reason': reason.slice(0, 500),
      'x-attempts': attempt,
    },
  });
  await deps.reject(
    raw,
    'SEND_FAILED',
    'The message could not be sent. Please try again.',
    meta,
  );
}

// --- server options ------------------------------------------------------------------

/** chat-service's command consumer: manual ack, one message at a time. */
export function commandServerOptions(
  url: string,
  topology: TopologySettings,
): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue: topology.names.chatCommands,
      queueOptions: queueOptions(topology, 'chatCommands'),
      noAck: false,
      // One at a time: commands from one sender are stored in send order.
      prefetchCount: 1,
      socketOptions: { reconnectTimeInSeconds: 1 },
    },
  };
}

/**
 * An event consumer.
 * - `{ instanceQueue }`: this process's own queue (gateway), exclusive and
 *   bound by Nest to one routing key per `@EventPattern` of the app
 *   (`wildcards`): give it an app whose only patterns are its events.
 * - `{ durableQueue: 'chatUserSync' }`: a shared durable queue whose bindings
 *   come from the topology. No `wildcards` here: Nest would bind it to every
 *   pattern of the app (its RPCs and commands too), as all the RMQ servers of
 *   one app share its handlers.
 */
export function eventServerOptions(
  url: string,
  topology: TopologySettings,
  queue: { instanceQueue: string } | { durableQueue: 'chatUserSync' },
  prefetchCount = 50,
): RmqOptions {
  const common = {
    urls: [url],
    noAck: false,
    prefetchCount,
    socketOptions: { reconnectTimeInSeconds: 1 },
  };
  if ('instanceQueue' in queue) {
    return {
      transport: Transport.RMQ,
      options: {
        ...common,
        exchange: topology.names.exchange,
        exchangeType: 'topic',
        wildcards: true,
        queue: queue.instanceQueue,
        queueOptions: INSTANCE_QUEUE_OPTIONS,
      },
    };
  }
  return {
    transport: Transport.RMQ,
    options: {
      ...common,
      queue: topology.names[queue.durableQueue],
      queueOptions: queueOptions(topology, queue.durableQueue),
    },
  };
}
