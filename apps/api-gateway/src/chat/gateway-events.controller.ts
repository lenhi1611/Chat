import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { consumeEvent, InflightTracker } from '@realtime-chat/api-messaging';
import {
  createEnvelope,
  DOMAIN_EVENTS,
  type DomainEvent,
  WS_CLOSE_CODES,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import { ConnectionRegistry } from './connection-registry';

/**
 * Events from the services, received on this instance's own queue
 * (`gateway.events.<instance>`, bound to these four types), delivered to the
 * sockets this instance holds. Delivery to a socket is fire-and-forget: a
 * user with no socket here simply gets nothing from this instance.
 */
@Controller()
export class GatewayEventsController {
  private readonly logger = new Logger(GatewayEventsController.name);

  constructor(
    private readonly connections: ConnectionRegistry,
    private readonly tracker: InflightTracker,
  ) {}

  @EventPattern(DOMAIN_EVENTS.messageCreated)
  messageCreated(@Payload() data: unknown, @Ctx() context: unknown) {
    return this.consume(data, context);
  }

  @EventPattern(DOMAIN_EVENTS.conversationCreated)
  conversationCreated(@Payload() data: unknown, @Ctx() context: unknown) {
    return this.consume(data, context);
  }

  @EventPattern(DOMAIN_EVENTS.messageRejected)
  messageRejected(@Payload() data: unknown, @Ctx() context: unknown) {
    return this.consume(data, context);
  }

  @EventPattern(DOMAIN_EVENTS.sessionRevoked)
  sessionRevoked(@Payload() data: unknown, @Ctx() context: unknown) {
    return this.consume(data, context);
  }

  private consume(data: unknown, context: unknown): Promise<void> {
    return consumeEvent(
      context as RmqContext,
      data,
      { tracker: this.tracker, logger: this.logger },
      (event) => this.deliver(event),
    );
  }

  private deliver(event: DomainEvent): void {
    switch (event.type) {
      case DOMAIN_EVENTS.messageCreated:
        this.connections.sendToUsers(
          event.payload.recipientUserIds,
          createEnvelope(WS_EVENTS.chatMessage, event.payload.message),
        );
        return;
      case DOMAIN_EVENTS.conversationCreated:
        this.connections.sendToUsers(
          event.payload.recipientUserIds,
          createEnvelope(WS_EVENTS.conversationCreated, {
            conversation: event.payload.conversation,
          }),
        );
        return;
      case DOMAIN_EVENTS.messageRejected: {
        const { userId, code, message, clientMessageId } = event.payload;
        this.connections.sendToUsers(
          [userId],
          createEnvelope(WS_EVENTS.systemError, {
            code,
            message,
            clientMessageId,
          }),
        );
        return;
      }
      case DOMAIN_EVENTS.sessionRevoked: {
        const closed = this.connections.closeSession(
          event.payload.sid,
          WS_CLOSE_CODES.sessionEnded,
          'Session ended',
        );
        if (closed > 0) {
          this.logger.log(
            `Closed ${closed} socket(s) of ended session ${event.payload.sid} [correlationId=${event.correlationId}]`,
          );
        }
        return;
      }
    }
  }
}
