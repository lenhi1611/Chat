import { randomUUID } from 'node:crypto';
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
import {
  type ChatSendPayload,
  createEnvelope,
  type ServerEnvelope,
  type SystemErrorPayload,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import type { WebSocket } from 'ws';
import { ConnectionRegistry } from './connection-registry';
import { nicknameFor } from './nickname';
import { INVALID_FRAME_EVENT } from './transport/client-frame-parser';
import { readClientId } from './transport/upgrade-verifier';

/** RFC 6455 close code "policy violation". */
const CLOSE_POLICY_VIOLATION = 1008;

/**
 * Chat over plain WebSocket. Path, payload limit and upgrade checks come from
 * ChatWsAdapter; frames reaching the handlers below are already validated
 * against the shared protocol (see client-frame-parser.ts).
 *
 * Message contents are never logged.
 */
@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly connections: ConnectionRegistry) {}

  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    // Already enforced during the upgrade; kept as a guard for other adapters.
    const clientId = readClientId(request.url);
    if (!clientId) {
      socket.close(CLOSE_POLICY_VIOLATION, 'Invalid clientId');
      return;
    }

    const { nickname } = this.connections.add(socket, {
      clientId,
      nickname: nicknameFor(clientId),
    });
    this.connections.send(
      socket,
      createEnvelope(WS_EVENTS.sessionWelcome, { clientId, nickname }),
    );
    this.logger.log(
      `Connected: ${nickname} (${this.connections.size} connected)`,
    );
  }

  handleDisconnect(socket: WebSocket): void {
    const info = this.connections.remove(socket);
    if (info) {
      this.logger.log(
        `Disconnected: ${info.nickname} (${this.connections.size} connected)`,
      );
    }
  }

  @SubscribeMessage(WS_EVENTS.chatSend)
  handleChatSend(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() payload: ChatSendPayload,
  ): void {
    const sender = this.connections.get(socket);
    if (!sender) return;

    // The server is the source of truth for id and sentAt.
    this.connections.broadcast(
      sender.roomId,
      createEnvelope(WS_EVENTS.chatMessage, {
        id: randomUUID(),
        clientMessageId: payload.clientMessageId,
        senderId: sender.clientId,
        senderNickname: sender.nickname,
        text: payload.text,
        sentAt: new Date().toISOString(),
      }),
    );
  }

  /** Replies to the offending client only; the connection stays open. */
  @SubscribeMessage(INVALID_FRAME_EVENT)
  handleInvalidFrame(@MessageBody() error: SystemErrorPayload): ServerEnvelope {
    return createEnvelope(WS_EVENTS.systemError, error);
  }
}
