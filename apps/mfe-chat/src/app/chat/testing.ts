import type { ChatMessage } from '@realtime-chat/chat-data-access';

export const ME = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';

let seq = 0;

/** A chat message with unique ids and increasing timestamps. */
export function aMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    clientMessageId: crypto.randomUUID(),
    senderId: crypto.randomUUID(),
    senderNickname: 'guest-abcd',
    text: `message ${seq}`,
    sentAt: new Date(Date.UTC(2026, 10, 4, 10, 0, seq)).toISOString(),
    ...overrides,
  };
}

export const isOwnBy =
  (clientId: string) =>
  (message: ChatMessage): boolean =>
    message.senderId === clientId;
