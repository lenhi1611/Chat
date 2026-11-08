import {
  type ChatSendCommand,
  COMMAND_PATTERNS,
  type DomainEvent,
} from '@realtime-chat/contracts';
import type { MessagingConnection } from './connection';
import type { EventPublisher } from './event-publisher.port';
import type { TopologyNames } from './topology';

/** Events go to the topic exchange, routing key = type, persistent. */
export class AmqpEventPublisher implements EventPublisher {
  constructor(
    private readonly connection: MessagingConnection,
    private readonly names: TopologyNames,
  ) {}

  publish(event: DomainEvent): Promise<void> {
    return this.connection.publish(
      this.names.exchange,
      event.type,
      { pattern: event.type, data: event },
      { correlationId: event.correlationId, messageId: event.id },
    );
  }
}

/** Commands go straight to their durable queue, persistent. */
export class CommandPublisher {
  constructor(
    private readonly connection: MessagingConnection,
    private readonly names: TopologyNames,
  ) {}

  /** Resolves once RabbitMQ has the command (publisher confirm). */
  sendChat(command: ChatSendCommand, correlationId: string): Promise<void> {
    return this.connection.sendToQueue(
      this.names.chatCommands,
      { pattern: COMMAND_PATTERNS.chatSend, data: command },
      { correlationId },
    );
  }
}
