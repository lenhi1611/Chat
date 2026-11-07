import type {
  ChatMessage,
  Conversation,
} from '@realtime-chat/chat-data-access';
import type { UserSummary } from '@realtime-chat/contracts';

/** The other member of a DM (the first other member of a group). */
export function otherMember(
  conversation: Conversation,
  myId: string | null,
): UserSummary | undefined {
  return conversation.members.find((member) => member.id !== myId);
}

/** Group name, or the other person's name for a DM. */
export function conversationTitle(
  conversation: Conversation,
  myId: string | null,
): string {
  if (conversation.type === 'group') return conversation.name ?? 'Group';
  return otherMember(conversation, myId)?.displayName ?? 'Direct message';
}

export function conversationSubtitle(
  conversation: Conversation,
  myId: string | null,
): string {
  if (conversation.type === 'group') {
    return `${conversation.members.length} members`;
  }
  const other = otherMember(conversation, myId);
  return other ? `@${other.username}` : '';
}

/** Up to two initials, for avatars. */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

/** "You: hi", "Ann: hi" (groups) or "hi" (DMs, from the other person). */
export function lastMessagePreview(
  conversation: Conversation,
  myId: string | null,
): string {
  const message = conversation.lastMessage;
  if (!message) return 'No messages yet';
  if (message.senderId === myId) return `You: ${message.text}`;
  if (conversation.type === 'dm') return message.text;
  const sender = conversation.members.find((m) => m.id === message.senderId);
  return `${sender?.displayName ?? 'Someone'}: ${message.text}`;
}

/** Display name of a message's sender, from the conversation members. */
export function senderNames(
  conversation: Conversation | null,
): (message: ChatMessage) => string {
  const names = new Map(
    (conversation?.members ?? []).map((member) => [
      member.id,
      member.displayName,
    ]),
  );
  return (message) => names.get(message.senderId) ?? 'Former member';
}
