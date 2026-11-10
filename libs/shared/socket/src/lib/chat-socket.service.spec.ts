import { TestBed } from '@angular/core/testing';
import { WS_CLOSE_CODES } from '@realtime-chat/contracts';
import { of } from 'rxjs';
import { provideChatSocket, WEB_SOCKET_FACTORY } from './chat-socket.config';
import { ChatSocketService, type SocketRejection } from './chat-socket.service';
import { FakeWebSocket } from './testing/fake-web-socket';

/** The client side of the socket lifecycle (phase 3, step 8). */
describe('ChatSocketService close codes', () => {
  let socket: ChatSocketService;
  let rejections: SocketRejection[];
  let tickets: number;

  beforeEach(() => {
    FakeWebSocket.reset();
    tickets = 0;
    TestBed.configureTestingModule({
      providers: [
        // A fresh ticket per attempt, like the real provider.
        provideChatSocket(() => () => of(`ws://x/ws?ticket=t${++tickets}`), {
          reconnect: { initialDelayMs: 1, maxDelayMs: 1, random: () => 0 },
        }),
        {
          provide: WEB_SOCKET_FACTORY,
          useValue: (url: string) => new FakeWebSocket(url),
        },
      ],
    });
    socket = TestBed.inject(ChatSocketService);
    rejections = [];
    socket.rejected$.subscribe((r) => rejections.push(r));
  });

  it('4000 (max age): reconnects with a new ticket, without ending the session', async () => {
    socket.connect();
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverClose(WS_CLOSE_CODES.maxAgeReached);
    expect(socket.state()).toBe('reconnecting');

    await new Promise((r) => setTimeout(r, 20));
    expect(FakeWebSocket.instances.map((s) => s.url)).toEqual([
      'ws://x/ws?ticket=t1',
      'ws://x/ws?ticket=t2',
    ]);
    FakeWebSocket.last.serverOpen();
    expect(socket.state()).toBe('open');
    expect(rejections).toEqual([]);
  });

  it('4401 (session ended): stops for good and reports it', async () => {
    socket.connect();
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverClose(WS_CLOSE_CODES.sessionEnded);
    await new Promise((r) => setTimeout(r, 20));
    expect(socket.state()).toBe('closed');
    expect(rejections).toEqual(['session-ended']);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
