import type { ChatMessage } from '@realtime-chat/chat-data-access';

export const ME = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';

let seq = 0;

/** A chat message with unique ids and increasing timestamps. */
export function aMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    conversationId: '0b9e1c2d-3f4a-4b5c-8d6e-7f8091a2b3c4',
    seq,
    clientMessageId: crypto.randomUUID(),
    senderId: crypto.randomUUID(),
    text: `message ${seq}`,
    sentAt: new Date(Date.UTC(2026, 10, 4, 10, 0, seq)).toISOString(),
    ...overrides,
  };
}

export const isOwnBy =
  (userId: string) =>
  (message: ChatMessage): boolean =>
    message.senderId === userId;
