import type { IncomingMessage } from 'node:http';
import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AuthService } from '@realtime-chat/api-auth';
import { ChatService } from '@realtime-chat/api-chat';
import {
  AppError,
  type ChatSendPayload,
  createEnvelope,
  type ServerEnvelope,
  type SystemErrorPayload,
  WS_CLOSE_CODES,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import type { Subscription } from 'rxjs';
import type { WebSocket } from 'ws';
import { ConnectionRegistry } from './connection-registry';
import { INVALID_FRAME_EVENT } from './transport/client-frame-parser';
import { getSocketOwner } from './transport/upgrade-verifier';

/** RFC 6455 close code "policy violation". */
const CLOSE_POLICY_VIOLATION = 1008;

/**
 * Authenticated chat over plain WebSocket. Path, payload limit and the ticket
 * check come from ChatWsAdapter; frames reaching the handlers below are
 * already validated against the shared protocol (client-frame-parser.ts).
 *
 * Message contents are never logged.
 */
@WebSocketGateway()
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(ChatGateway.name);
  private sessionsEnded?: Subscription;

  constructor(
    private readonly connections: ConnectionRegistry,
    private readonly chat: ChatService,
    private readonly auth: AuthService,
  ) {}

  /** Logout (or a revoked session) closes that session's sockets with 4401. */
  onModuleInit(): void {
    this.sessionsEnded = this.auth.sessionsEnded$.subscribe(({ sid }) => {
      const closed = this.connections.closeSession(
        sid,
        WS_CLOSE_CODES.sessionEnded,
        'Session ended',
      );
      if (closed > 0)
        this.logger.log(`Closed ${closed} socket(s) of ended session ${sid}`);
    });
  }

  onModuleDestroy(): void {
    this.sessionsEnded?.unsubscribe();
  }

  async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    // Always set by the upgrade verifier; kept as a guard for other adapters.
    const owner = getSocketOwner(request);
    if (!owner) {
      socket.close(CLOSE_POLICY_VIOLATION, 'Not authenticated');
      return;
    }
    // Registered before any await: frames, pongs and logout reach it at once.
    this.connections.add(socket, owner);
    try {
      // Every room of the user, in one query.
      this.connections.join(
        socket,
        await this.chat.getConversationIdsForUser(owner.userId),
      );
    } catch (error) {
      this.logger.error(
        `Could not load rooms of user ${owner.userId}: ${error instanceof Error ? error.message : error}`,
      );
      socket.close(1011, 'Try again');
      return;
    }
    // Welcome last: once it arrives, the client receives all its conversations.
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
   * Validate (parser) → member? → store (seq) → broadcast to every socket of
   * every member, sender included. Failures answer the sender only, with its
   * clientMessageId; the connection stays open.
   */
  @SubscribeMessage(WS_EVENTS.chatSend)
  async handleChatSend(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() payload: ChatSendPayload,
  ): Promise<ServerEnvelope | undefined> {
    const sender = this.connections.get(socket);
    if (!sender) return undefined;
    try {
      const { value: message, created } = await this.chat.saveMessage({
        senderId: sender.userId,
        conversationId: payload.conversationId,
        clientMessageId: payload.clientMessageId,
        text: payload.text,
      });
      // Membership is now proven: make sure this socket is in the room even
      // if the conversation appeared after it connected.
      this.connections.join(socket, [message.conversationId]);
      const envelope = createEnvelope(WS_EVENTS.chatMessage, message);
      if (created) {
        this.connections.sendToConversation(message.conversationId, envelope);
        return undefined;
      }
      // A resend of a stored message: everyone else already has it.
      return envelope;
    } catch (error) {
      if (error instanceof AppError && error.code === 'NOT_FOUND') {
        return this.error(
          'NOT_A_MEMBER',
          'Not a member of this conversation',
          payload,
        );
      }
      this.logger.error(
        `chat.send failed for user ${sender.userId}: ${error instanceof Error ? error.message : error}`,
      );
      return this.error(
        'SEND_FAILED',
        'Message could not be sent, retry',
        payload,
      );
    }
  }

  /** Replies to the offending socket only; the connection stays open. */
  @SubscribeMessage(INVALID_FRAME_EVENT)
  handleInvalidFrame(@MessageBody() error: SystemErrorPayload): ServerEnvelope {
    return createEnvelope(WS_EVENTS.systemError, error);
  }

  private error(
    code: SystemErrorPayload['code'],
    message: string,
    payload: ChatSendPayload,
  ): ServerEnvelope {
    return createEnvelope(WS_EVENTS.systemError, {
      code,
      message,
      clientMessageId: payload.clientMessageId,
    });
  }
}
