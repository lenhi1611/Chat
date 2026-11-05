import { TestBed } from '@angular/core/testing';
import { provideStore, Store } from '@ngrx/store';
import { ChatSocketService } from '@realtime-chat/socket';
import { ChatActions } from './chat.actions';
import {
  selectConnectionStatus,
  selectIsOwnMessage,
  selectMessages,
  selectNickname,
} from './chat.selectors';
import { provideChatData } from './provide-chat-data';
import { aMessage, MockChatSocket } from './testing/mock-chat-socket';

/** Store + features + effects wired together, as the shell does it. */
describe('provideChatData', () => {
  it('turns socket traffic into store state readable with selectSignal', () => {
    const socket = new MockChatSocket();
    TestBed.configureTestingModule({
      providers: [
        provideStore(),
        provideChatData(),
        { provide: ChatSocketService, useValue: socket },
      ],
    });
    const store = TestBed.inject(Store);
    const status = store.selectSignal(selectConnectionStatus);
    const messages = store.selectSignal(selectMessages);
    const isOwn = store.selectSignal(selectIsOwnMessage);

    store.dispatch(ChatActions.connect());
    expect(status()).toBe('connecting');

    socket.setState('open');
    socket.emit({
      event: 'session.welcome',
      data: { clientId: socket.clientId, nickname: 'guest-7f1c' },
    });
    const mine = aMessage({
      senderId: socket.clientId,
      sentAt: '2026-11-04T10:00:01.000Z',
    });
    const theirs = aMessage({ sentAt: '2026-11-04T10:00:02.000Z' });
    socket.emit({ event: 'chat.message', data: theirs });
    socket.emit({ event: 'chat.message', data: mine });
    socket.emit({ event: 'chat.message', data: mine }); // duplicate delivery

    expect(status()).toBe('open');
    expect(store.selectSignal(selectNickname)()).toBe('guest-7f1c');
    expect(messages().map((m) => m.id)).toEqual([mine.id, theirs.id]);
    expect(messages().map((m) => isOwn()(m))).toEqual([true, false]);

    store.dispatch(ChatActions.sendMessage({ text: 'hi' }));
    expect(socket.send).toHaveBeenCalledWith('chat.send', {
      clientMessageId: expect.any(String),
      text: 'hi',
    });

    store.dispatch(ChatActions.disconnect());
    expect(status()).toBe('closed');
  });
});
