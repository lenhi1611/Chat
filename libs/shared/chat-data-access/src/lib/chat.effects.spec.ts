import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import type { Action } from '@ngrx/store';
import { MAX_TEXT_LENGTH } from '@realtime-chat/contracts';
import { ChatSocketService } from '@realtime-chat/socket';
import { Subject } from 'rxjs';
import { ChatActions } from './chat.actions';
import { connect$, disconnect$, send$ } from './chat.effects';
import { aMessage, MockChatSocket } from './testing/mock-chat-socket';

let actions$: Subject<Action>;
let socket: MockChatSocket;

beforeEach(() => {
  actions$ = new Subject<Action>();
  socket = new MockChatSocket();
  TestBed.configureTestingModule({
    providers: [
      provideMockActions(() => actions$),
      { provide: ChatSocketService, useValue: socket },
    ],
  });
});

/** Subscribes to a functional effect (inside DI) and records what it dispatches. */
function run(effect: () => import('rxjs').Observable<Action>) {
  const out: Action[] = [];
  const sub = TestBed.runInInjectionContext(effect).subscribe((a) =>
    out.push(a),
  );
  return { out, sub };
}

describe('connect$', () => {
  it('connects and maps socket state and events to actions', () => {
    const { out } = run(connect$);
    actions$.next(ChatActions.connect());

    expect(socket.connect).toHaveBeenCalledTimes(1);

    socket.setState('open');
    socket.emit({
      event: 'session.welcome',
      data: { clientId: socket.clientId, nickname: 'guest-7f1c' },
    });
    const message = aMessage();
    socket.emit({ event: 'chat.message', data: message });
    socket.emit({
      event: 'system.error',
      data: { code: 'UNKNOWN_EVENT', message: 'nope' },
    });

    expect(out).toEqual([
      ChatActions.connectionStatusChanged({ status: 'connecting' }),
      ChatActions.connectionStatusChanged({ status: 'open' }),
      ChatActions.welcomeReceived({
        clientId: socket.clientId,
        nickname: 'guest-7f1c',
      }),
      ChatActions.messageReceived({ message }),
      ChatActions.serverErrorReceived({
        error: {
          code: 'UNKNOWN_EVENT',
          message: 'nope',
          at: expect.any(String),
        },
      }),
    ]);
  });

  it('is idempotent: a second connect neither reconnects nor duplicates actions', () => {
    const { out } = run(connect$);
    actions$.next(ChatActions.connect());
    actions$.next(ChatActions.connect());

    expect(socket.connect).toHaveBeenCalledTimes(1);
    socket.emit({ event: 'chat.message', data: aMessage() });
    expect(
      out.filter((a) => a.type === ChatActions.messageReceived.type),
    ).toHaveLength(1);
  });

  it('stops listening on disconnect, and can connect again', () => {
    const { out } = run(connect$);
    actions$.next(ChatActions.connect());
    actions$.next(ChatActions.disconnect());
    out.length = 0;

    socket.emit({ event: 'chat.message', data: aMessage() });
    socket.setState('open');
    expect(out).toEqual([]);

    actions$.next(ChatActions.connect());
    expect(socket.connect).toHaveBeenCalledTimes(2);
    socket.emit({ event: 'chat.message', data: aMessage() });
    expect(out.map((a) => a.type)).toContain(ChatActions.messageReceived.type);
  });
});

describe('disconnect$', () => {
  it('disconnects the socket and reports the final status', () => {
    const { out } = run(disconnect$);
    actions$.next(ChatActions.disconnect());
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      ChatActions.connectionStatusChanged({ status: 'closed' }),
    ]);
  });
});

describe('send$', () => {
  it('sends chat.send with a fresh clientMessageId and dispatches nothing', () => {
    socket.setState('open');
    const { out } = run(send$);

    actions$.next(ChatActions.sendMessage({ text: '  hi  ' }));
    actions$.next(ChatActions.sendMessage({ text: 'again' }));

    expect(socket.send).toHaveBeenCalledTimes(2);
    const [[event, first], [, second]] = socket.send.mock.calls as [
      string,
      { clientMessageId: string; text: string },
    ][];
    expect(event).toBe('chat.send');
    expect(first.text).toBe('hi');
    expect(first.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.clientMessageId).not.toBe(first.clientMessageId);
    expect(out).toEqual([]);
  });

  it('dispatches a local NOT_CONNECTED error when the socket is not open', () => {
    socket.setState('reconnecting');
    const { out } = run(send$);
    actions$.next(ChatActions.sendMessage({ text: 'hi' }));
    expect(out).toEqual([
      ChatActions.serverErrorReceived({
        error: {
          code: 'NOT_CONNECTED',
          message: expect.any(String),
          at: expect.any(String),
        },
      }),
    ]);
  });

  it.each([
    ['empty', '   ', 'INVALID_PAYLOAD'],
    ['too long', 'a'.repeat(MAX_TEXT_LENGTH + 1), 'MESSAGE_TOO_LONG'],
  ])('rejects %s text locally without sending', (_label, text, code) => {
    socket.setState('open');
    const { out } = run(send$);
    actions$.next(ChatActions.sendMessage({ text }));
    expect(socket.send).not.toHaveBeenCalled();
    expect(out).toEqual([
      ChatActions.serverErrorReceived({
        error: { code, message: expect.any(String), at: expect.any(String) },
      } as never),
    ]);
  });

  it('keeps working after an error', () => {
    socket.setState('closed');
    const { out } = run(send$);
    actions$.next(ChatActions.sendMessage({ text: 'hi' }));
    socket.setState('open');
    actions$.next(ChatActions.sendMessage({ text: 'hi' }));
    expect(out).toHaveLength(1);
    expect(socket.send).toHaveBeenCalledTimes(2);
  });
});
