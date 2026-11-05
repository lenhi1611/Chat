import type {
  ConversationDTO,
  MessageDTO,
  UserSummary,
} from '@realtime-chat/contracts';
import type {
  Conversation,
  ConversationMember,
  Message,
} from '../generated/prisma/client';

export const toMessageDto = (message: Message): MessageDTO => ({
  id: message.id,
  conversationId: message.conversationId,
  seq: message.seq,
  clientMessageId: message.clientMessageId,
  senderId: message.senderId,
  text: message.text,
  sentAt: message.sentAt.toISOString(),
});

/** Shown for a member whose account no longer exists in auth_db. */
const unknownUser = (id: string): UserSummary => ({
  id,
  username: 'unknown',
  displayName: 'Unknown user',
});

export function toConversationDto(
  conversation: Conversation & { members: ConversationMember[] },
  usersById: ReadonlyMap<string, UserSummary>,
  lastMessage: Message | null,
): ConversationDTO {
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    members: conversation.members.map(
      (m) => usersById.get(m.userId) ?? unknownUser(m.userId),
    ),
    lastMessage: lastMessage ? toMessageDto(lastMessage) : null,
    createdAt: conversation.createdAt.toISOString(),
  };
}
