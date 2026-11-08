import { Logger } from '@nestjs/common';
import { AppError, MESSAGING_HEADERS } from '@realtime-chat/contracts';
import { type ChannelWrapper, connect } from 'amqp-connection-manager';
import type { ConfirmChannel, Options } from 'amqplib';
import { declareTopology, type TopologySettings } from './topology';

export interface MessagingConnectionOptions {
  /** e.g. `amqp://user:pass@localhost:5672` */
  url: string;
  /** Shown in RabbitMQ's management UI (connection name) and in logs. */
  name: string;
  topology: TopologySettings;
  /** A publish not confirmed by the broker within this time fails. */
  publishTimeoutMs: number;
}

/** First retry after 0.5 s, doubling up to 30 s, with jitter. */
export function reconnectDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  const ceiling = Math.min(30_000, 500 * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

export interface PublishMeta {
  correlationId: string;
  /** Survives a broker restart (on a durable queue). Default true. */
  persistent?: boolean;
  messageId?: string;
}

/**
 * This app's own connection, besides the ones Nest's RMQ transport opens for
 * its servers and clients. It:
 *
 * - declares the whole topology, again after every reconnect (the retry and
 *   dead-letter queues have no consumer that would assert them);
 * - publishes events and commands on a confirm channel: a publish resolves
 *   once the broker has taken the message, and fails otherwise.
 *
 * Starting while RabbitMQ is down does not crash: it keeps retrying with
 * backoff; `whenReady()` resolves once connected and declared.
 */
export class MessagingConnection {
  private readonly logger: Logger;
  private manager?: ReturnType<typeof connect>;
  private channel?: ChannelWrapper;
  private failedAttempts = 0;
  /** Ends the current backoff wait early (on close). */
  private stopWaiting?: () => void;

  constructor(private readonly options: MessagingConnectionOptions) {
    this.logger = new Logger(`Messaging:${options.name}`);
  }

  start(): void {
    if (this.manager) return;
    const { url, name, topology } = this.options;
    // No static URL: findServers supplies it (after the backoff delay).
    this.manager = connect(null, {
      // Called before every connection attempt: the backoff lives here.
      findServers: async () => {
        const delay = reconnectDelayMs(this.failedAttempts);
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delay);
            this.stopWaiting = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          this.stopWaiting = undefined;
        }
        return url;
      },
      reconnectTimeInSeconds: 0,
      connectionOptions: { clientProperties: { connection_name: name } },
    });
    this.manager.on('connect', () => {
      if (this.failedAttempts > 0)
        this.logger.log('RabbitMQ connection restored');
      this.failedAttempts = 0;
    });
    this.manager.on('connectFailed', ({ err }: { err: Error }) => {
      this.failedAttempts += 1;
      this.logger.warn(
        `RabbitMQ unreachable (attempt ${this.failedAttempts}): ${err.message}`,
      );
    });
    this.manager.on('disconnect', ({ err }: { err?: Error }) => {
      this.logger.warn(`RabbitMQ connection lost: ${err?.message ?? 'closed'}`);
    });
    const channel = this.manager.createChannel({
      name: `${name}-publisher`,
      confirm: true,
      json: false,
      publishTimeout: this.options.publishTimeoutMs,
      setup: (channel: ConfirmChannel) => declareTopology(channel, topology),
    });
    channel.on('error', (error: unknown) =>
      this.logger.error(
        `Channel error: ${error instanceof Error ? error.message : error}`,
      ),
    );
    this.channel = channel;
  }

  /** Connected, with the topology declared. Waits as long as needed. */
  async whenReady(): Promise<void> {
    this.start();
    await this.channel?.waitForConnect();
  }

  isConnected(): boolean {
    return this.manager?.isConnected() ?? false;
  }

  /** Publishes `{ pattern, data }` (Nest's packet format) to an exchange. */
  publish(
    exchange: string,
    routingKey: string,
    packet: { pattern: string; data: unknown },
    meta: PublishMeta,
  ): Promise<void> {
    return this.send(
      (channel, options) =>
        channel.publish(exchange, routingKey, encode(packet), options),
      meta,
    );
  }

  /** Same, straight to a queue (default exchange). */
  sendToQueue(
    queue: string,
    packet: { pattern: string; data: unknown } | Buffer,
    meta: PublishMeta & { headers?: Record<string, unknown> },
  ): Promise<void> {
    const content = Buffer.isBuffer(packet) ? packet : encode(packet);
    return this.send(
      (channel, options) => channel.sendToQueue(queue, content, options),
      meta,
    );
  }

  async close(): Promise<void> {
    // A pending reconnect would otherwise hold close() for up to 30 s.
    this.stopWaiting?.();
    await this.channel?.close().catch(() => undefined);
    await this.manager?.close().catch(() => undefined);
    this.channel = undefined;
    this.manager = undefined;
  }

  /**
   * Fails at once when disconnected rather than letting the channel wrapper
   * queue the message in memory and send it later: the caller has been told
   * it failed by then (a "ghost" message). Connected, a message the broker
   * does not confirm in time is withdrawn and the publish fails.
   */
  private async send(
    publish: (
      channel: ChannelWrapper,
      options: Options.Publish & { timeout: number },
    ) => Promise<boolean>,
    meta: PublishMeta & { headers?: Record<string, unknown> },
  ): Promise<void> {
    const channel = this.channel;
    if (!channel || !this.isConnected()) {
      throw unavailable('RabbitMQ is not reachable');
    }
    try {
      await publish(channel, {
        persistent: meta.persistent ?? true,
        contentType: 'application/json',
        messageId: meta.messageId,
        headers: {
          ...meta.headers,
          [MESSAGING_HEADERS.correlationId]: meta.correlationId,
        },
        timeout: this.options.publishTimeoutMs,
      });
    } catch (error) {
      throw unavailable(
        `RabbitMQ did not confirm the message: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

const encode = (packet: { pattern: string; data: unknown }) =>
  Buffer.from(JSON.stringify(packet));

const unavailable = (message: string) =>
  new AppError('SERVICE_UNAVAILABLE', message);
