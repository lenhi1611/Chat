import type { IncomingMessage } from 'node:http';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { CommandPublisher } from '@realtime-chat/api-messaging';
import {
  type ChatSendPayload,
  createEnvelope,
  type ServerEnvelope,
  type SystemErrorPayload,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import type { WebSocket } from 'ws';
import { ConnectionRegistry } from './connection-registry';
import { INVALID_FRAME_EVENT } from './transport/client-frame-parser';
import { getSocketOwner } from './transport/upgrade-verifier';

/** RFC 6455 close code "policy violation". */
const CLOSE_POLICY_VIOLATION = 1008;

/**
 * Authenticated chat over plain WebSocket: the edge between browsers and
 * chat-service. Path, payload limit and the ticket check come from
 * ChatWsAdapter; frames reaching the handlers are already validated against
 * the shared protocol (client-frame-parser.ts).
 *
 * It stores nothing and checks no membership: `chat.send` becomes a command
 * for chat-service, and what comes back (stored message, rejection) arrives
 * as events (GatewayEventsController). Message contents are never logged.
 */
@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  /** Tail of each socket's chat.send queue (see handleChatSend). */
  private readonly sendQueues = new WeakMap<WebSocket, Promise<unknown>>();

  constructor(
    private readonly connections: ConnectionRegistry,
    private readonly commands: CommandPublisher,
  ) {}

  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    // Always set by the upgrade verifier; kept as a guard for other adapters.
    const owner = getSocketOwner(request);
    if (!owner) {
      socket.close(CLOSE_POLICY_VIOLATION, 'Not authenticated');
      return;
    }
    this.connections.add(socket, owner);
    // No rooms to load: events name their recipients.
    this.connections.send(
      socket,
      createEnvelope(WS_EVENTS.sessionWelcome, { userId: owner.userId }),
    );
    this.logger.log(
      `Connected: user ${owner.userId} (${this.connections.size} sockets)`,
    );
  }

  handleDisconnect(socket: WebSocket): void {
    const info = this.connections.remove(socket);
    if (info) {
      this.logger.log(
        `Disconnected: user ${info.userId} (${this.connections.size} sockets)`,
      );
    }
  }

  /**
   * Hands the message to chat-service as a durable command, once RabbitMQ
   * has confirmed it. One socket's frames are published one after another,
   * so they reach the queue (and get their `seq`) in the order typed. If
   * RabbitMQ cannot take it, the sender gets SEND_FAILED right away;
   * otherwise the outcome arrives later as an event.
   */
  @SubscribeMessage(WS_EVENTS.chatSend)
  handleChatSend(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() payload: ChatSendPayload,
  ): Promise<ServerEnvelope | undefined> {
    const previous = this.sendQueues.get(socket) ?? Promise.resolve();
    const result = previous.then(() => this.publish(socket, payload));
    this.sendQueues.set(
      socket,
      result.catch(() => undefined),
    );
    return result;
  }

  /** Replies to the offending socket only; the connection stays open. */
  @SubscribeMessage(INVALID_FRAME_EVENT)
  handleInvalidFrame(@MessageBody() error: SystemErrorPayload): ServerEnvelope {
    return createEnvelope(WS_EVENTS.systemError, error);
  }

  private async publish(
    socket: WebSocket,
    payload: ChatSendPayload,
  ): Promise<ServerEnvelope | undefined> {
    const sender = this.connections.get(socket);
    if (!sender) return undefined;
    const correlationId = crypto.randomUUID();
    try {
      await this.commands.sendChat(
        {
          ...payload,
          userId: sender.userId,
          requestedAt: new Date().toISOString(),
        },
        correlationId,
      );
      this.logger.log(
        `chat.send queued for user ${sender.userId} [correlationId=${correlationId}]`,
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        `chat.send could not be queued [correlationId=${correlationId}]: ${error instanceof Error ? error.message : error}`,
      );
      return createEnvelope(WS_EVENTS.systemError, {
        code: 'SEND_FAILED',
        message: 'Message could not be sent, retry',
        clientMessageId: payload.clientMessageId,
      });
    }
  }
}
