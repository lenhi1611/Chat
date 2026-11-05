import { chatFeature, initialChatState, messagesAdapter } from './chat.feature';
import {
  selectConnectionStatus,
  selectIsConnected,
  selectIsOwnMessage,
  selectLastError,
  selectMessages,
} from './chat.selectors';
import { connectionFeature, type ConnectionState } from './connection.feature';
import { aMessage } from './testing/mock-chat-socket';

const ME = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';

function rootState(
  connection: Partial<ConnectionState>,
  messages = [aMessage()],
) {
  return {
    [connectionFeature.name]: {
      status: 'open' as const,
      clientId: ME,
      nickname: 'guest-7f1c',
      ...connection,
    },
    [chatFeature.name]: messagesAdapter.setAll(messages, initialChatState),
  };
}

describe('chat selectors', () => {
  it('selectMessages returns messages oldest first', () => {
    const late = aMessage({ sentAt: '2026-11-04T10:00:09.000Z' });
    const early = aMessage({ sentAt: '2026-11-04T10:00:01.000Z' });
    expect(selectMessages(rootState({}, [late, early]))).toEqual([early, late]);
  });

  it('selectIsConnected is true only when open', () => {
    expect(selectIsConnected(rootState({ status: 'open' }))).toBe(true);
    expect(selectIsConnected(rootState({ status: 'reconnecting' }))).toBe(
      false,
    );
    expect(selectConnectionStatus(rootState({ status: 'closed' }))).toBe(
      'closed',
    );
  });

  it('selectIsOwnMessage compares senderId with the clientId', () => {
    const isOwn = selectIsOwnMessage(rootState({}));
    expect(isOwn({ senderId: ME })).toBe(true);
    expect(isOwn({ senderId: crypto.randomUUID() })).toBe(false);
  });

  it('selectIsOwnMessage is false for everything before the welcome', () => {
    const isOwn = selectIsOwnMessage(rootState({ clientId: null }));
    expect(isOwn({ senderId: ME })).toBe(false);
  });

  it('selectLastError is null initially', () => {
    expect(selectLastError(rootState({}))).toBeNull();
  });
});
