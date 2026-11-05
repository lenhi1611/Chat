import { ChatActions } from './chat.actions';
import { chatFeature, initialChatState } from './chat.feature';
import {
  connectionFeature,
  initialConnectionState,
} from './connection.feature';
import { aMessage } from './testing/mock-chat-socket';

describe('connection reducer', () => {
  const reduce = connectionFeature.reducer;

  it('tracks the socket status', () => {
    const state = reduce(
      initialConnectionState,
      ChatActions.connectionStatusChanged({ status: 'reconnecting' }),
    );
    expect(state.status).toBe('reconnecting');
  });

  it('stores the identity from session.welcome', () => {
    const state = reduce(
      initialConnectionState,
      ChatActions.welcomeReceived({ clientId: 'c-1', nickname: 'guest-c1' }),
    );
    expect(state).toEqual({
      status: 'idle',
      clientId: 'c-1',
      nickname: 'guest-c1',
    });
  });
});

describe('chat reducer', () => {
  const reduce = chatFeature.reducer;
  const received = (m: ReturnType<typeof aMessage>) =>
    ChatActions.messageReceived({ message: m });

  it('adds messages sorted by sentAt, whatever the arrival order', () => {
    const later = aMessage({
      sentAt: '2026-11-04T10:00:02.000Z',
      text: 'second',
    });
    const earlier = aMessage({
      sentAt: '2026-11-04T10:00:01.000Z',
      text: 'first',
    });

    let state = reduce(initialChatState, received(later));
    state = reduce(state, received(earlier));

    expect(state.ids).toEqual([earlier.id, later.id]);
  });

  it('breaks sentAt ties by id so the order is deterministic', () => {
    const sentAt = '2026-11-04T10:00:00.000Z';
    const b = aMessage({ id: 'bbbbbbbb-0000-4000-8000-000000000000', sentAt });
    const a = aMessage({ id: 'aaaaaaaa-0000-4000-8000-000000000000', sentAt });
    const state = reduce(reduce(initialChatState, received(b)), received(a));
    expect(state.ids).toEqual([a.id, b.id]);
  });

  it('deduplicates by id', () => {
    const message = aMessage();
    let state = reduce(initialChatState, received(message));
    state = reduce(state, received({ ...message, text: 'changed' }));
    expect(state.ids).toEqual([message.id]);
    expect(state.entities[message.id]?.text).toBe('hello');
  });

  it('keeps the last error until dismissed', () => {
    const error = {
      code: 'UNKNOWN_EVENT' as const,
      message: 'x',
      at: '2026-11-04T10:00:00Z',
    };
    let state = reduce(
      initialChatState,
      ChatActions.serverErrorReceived({ error }),
    );
    expect(state.lastError).toEqual(error);
    state = reduce(state, ChatActions.errorDismissed());
    expect(state.lastError).toBeNull();
  });
});
