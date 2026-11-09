import { Injectable } from '@nestjs/common';
import {
  type ConversationDTO,
  createEnvelope,
  WS_CLOSE_CODES,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import { ConnectionRegistry } from './connection-registry';

/** RFC 6455 application close code: the login session is over. */
const SESSION_ENDED = WS_CLOSE_CODES.sessionEnded;

/**
 * Pushes REST-side changes to connected sockets. Phase 3, step 6 only: the
 * REST calls go to the services over RabbitMQ, but this gateway does not
 * consume their events yet (step 7), so it still pushes these itself.
 */
@Injectable()
export class ChatRealtimeService {
  constructor(private readonly connections: ConnectionRegistry) {}

  /**
   * A conversation was just created: subscribe every open socket of its
   * members to it (so its messages reach them), then announce it.
   */
  conversationCreated(conversation: ConversationDTO): void {
    this.connections.joinUsers(
      conversation.id,
      conversation.members.map((m) => m.id),
    );
    this.connections.sendToConversation(
      conversation.id,
      createEnvelope(WS_EVENTS.conversationCreated, { conversation }),
    );
  }

  /** A session ended through REST (logout): close its sockets with 4401. */
  sessionEnded(sid: string): void {
    this.connections.closeSession(sid, SESSION_ENDED, 'Session ended');
  }
}
