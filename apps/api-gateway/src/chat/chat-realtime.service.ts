import { Injectable } from '@nestjs/common';
import {
  type ConversationDTO,
  createEnvelope,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import { ConnectionRegistry } from './connection-registry';

/** Pushes REST-side changes to connected sockets. */
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
}
