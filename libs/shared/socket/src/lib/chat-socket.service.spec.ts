import { TestBed } from '@angular/core/testing';
import type { ServerEnvelope } from '@realtime-chat/contracts';
import {
  CLIENT_ID_STORAGE,
  provideChatSocket,
  WEB_SOCKET_FACTORY,
} from './chat-socket.config';
import {
  ChatSocketService,
  type ChatSocketState,
  SocketNotOpenError,
} from './chat-socket.service';
import { CLIENT_ID_STORAGE_KEY } from './client-id';
import { FakeWebSocket } from './testing/fake-web-socket';

const URL = 'ws://localhost:3000/ws';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function setup(
  storage: ReturnType<typeof memoryStorage> | null = memoryStorage(),
) {
  TestBed.configureTestingModule({
    providers: [
      provideChatSocket({
        url: URL,
        // random() = 1 → delay is the full ceiling: 500, 1000, 2000, … 10000
        reconnect: { random: () => 1 },
      }),
      {
        provide: WEB_SOCKET_FACTORY,
        useValue: (url: string) => new FakeWebSocket(url),
      },
      { provide: CLIENT_ID_STORAGE, useValue: storage },
    ],
  });
  const service = TestBed.inject(ChatSocketService);
  const states: ChatSocketState[] = [];
  const events: ServerEnvelope[] = [];
  const subs = [
    service.state$.subscribe((s) => states.push(s)),
    service.events$.subscribe((e) => events.push(e)),
  ];
  return {
    service,
    states,
    events,
    unsubscribe: () => subs.forEach((s) => s.unsubscribe()),
  };
}

const welcome = (clientId: string) =>
  JSON.stringify({
    event: 'session.welcome',
    data: { clientId, nickname: 'guest-abcd' },
  });

beforeEach(() => {
  FakeWebSocket.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

describe('ChatSocketService', () => {
  describe('connection lifecycle', () => {
    it('goes idle → connecting → open, with the clientId in the URL', () => {
      const { service, states } = setup();
      expect(service.state()).toBe('idle');

      service.connect();
      expect(service.state()).toBe('connecting');
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(FakeWebSocket.last.url).toBe(
        `${URL}?clientId=${service.clientId}`,
      );

      FakeWebSocket.last.serverOpen();
      expect(service.state()).toBe('open');
      expect(states).toEqual(['idle', 'connecting', 'open']);
    });

    it('connect() is idempotent while connecting, open and reconnecting', () => {
      const { service } = setup();
      service.connect();
      service.connect(); // connecting
      expect(FakeWebSocket.instances).toHaveLength(1);

      FakeWebSocket.last.serverOpen();
      service.connect(); // open
      expect(FakeWebSocket.instances).toHaveLength(1);

      FakeWebSocket.last.serverClose();
      expect(service.state()).toBe('reconnecting');
      service.connect(); // reconnecting
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('throws a clear error when no endpoint is configured', () => {
      TestBed.configureTestingModule({});
      expect(() => TestBed.inject(ChatSocketService).connect()).toThrow(
        /provideChatSocket/,
      );
    });
  });

  describe('reconnection', () => {
    it('reconnects after an unexpected close with exponential backoff, capped', () => {
      const { service } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();

      const expectedDelays = [500, 1000, 2000, 4000, 8000, 10_000, 10_000];
      FakeWebSocket.last.serverClose(1006);
      for (const [i, delay] of expectedDelays.entries()) {
        expect(service.state()).toBe('reconnecting');
        vi.advanceTimersByTime(delay - 1);
        expect(FakeWebSocket.instances).toHaveLength(i + 1);
        vi.advanceTimersByTime(1);
        expect(FakeWebSocket.instances).toHaveLength(i + 2);
        FakeWebSocket.last.serverClose(1006); // this attempt fails too
      }
    });

    it('also retries when the very first attempt fails', () => {
      const { service, states } = setup();
      service.connect();
      FakeWebSocket.last.serverClose(1006);
      expect(service.state()).toBe('reconnecting');

      vi.advanceTimersByTime(500);
      FakeWebSocket.last.serverOpen();
      expect(states).toEqual(['idle', 'connecting', 'reconnecting', 'open']);
    });

    it('resets the backoff once a reconnection succeeds', () => {
      const { service } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();

      FakeWebSocket.last.serverClose();
      vi.advanceTimersByTime(500);
      FakeWebSocket.last.serverClose(); // second attempt fails → next is 1000
      vi.advanceTimersByTime(1000);
      FakeWebSocket.last.serverOpen();
      expect(service.state()).toBe('open');

      FakeWebSocket.last.serverClose();
      vi.advanceTimersByTime(499);
      expect(FakeWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1); // back to 500 ms
      expect(FakeWebSocket.instances).toHaveLength(4);
    });

    it('applies jitter within [ceiling / 2, ceiling]', () => {
      TestBed.configureTestingModule({
        providers: [
          provideChatSocket({ url: URL, reconnect: { random: () => 0 } }),
          {
            provide: WEB_SOCKET_FACTORY,
            useValue: (url: string) => new FakeWebSocket(url),
          },
          { provide: CLIENT_ID_STORAGE, useValue: null },
        ],
      });
      const service = TestBed.inject(ChatSocketService);
      service.connect();
      FakeWebSocket.last.serverClose();
      vi.advanceTimersByTime(250); // random 0 → half of 500
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
  });

  describe('disconnect()', () => {
    it('closes the socket with 1000 and never reconnects', () => {
      const { service } = setup();
      service.connect();
      const socket = FakeWebSocket.last;
      socket.serverOpen();

      service.disconnect();
      expect(service.state()).toBe('closed');
      expect(socket.closeCalls).toEqual([1000]);

      vi.advanceTimersByTime(60_000);
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('cancels a pending retry while reconnecting', () => {
      const { service } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();
      FakeWebSocket.last.serverClose();
      expect(service.state()).toBe('reconnecting');

      service.disconnect();
      vi.advanceTimersByTime(60_000);
      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(service.state()).toBe('closed');
    });

    it('allows connecting again afterwards', () => {
      const { service } = setup();
      service.connect();
      service.disconnect();
      service.connect();
      expect(service.state()).toBe('connecting');
      expect(FakeWebSocket.instances).toHaveLength(2);
    });
  });

  describe('events$', () => {
    it('emits validated server envelopes', () => {
      const { service, events } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();
      FakeWebSocket.last.serverSend(welcome(service.clientId));

      expect(events).toEqual([
        {
          event: 'session.welcome',
          data: { clientId: service.clientId, nickname: 'guest-abcd' },
        },
      ]);
    });

    it('drops invalid frames with a warning and keeps the stream alive', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const { service, events } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();

      FakeWebSocket.last.serverSend('{not json');
      FakeWebSocket.last.serverSend(
        JSON.stringify({ event: 'chat.send', data: {} }),
      );
      FakeWebSocket.last.serverSend(new ArrayBuffer(4));
      FakeWebSocket.last.serverSend(welcome(service.clientId));

      expect(warn).toHaveBeenCalledTimes(3);
      expect(events.map((e) => e.event)).toEqual(['session.welcome']);
      warn.mockRestore();
    });

    it('keeps emitting after a reconnect (same stream)', () => {
      const { service, events } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();
      FakeWebSocket.last.serverClose();
      vi.advanceTimersByTime(500);
      FakeWebSocket.last.serverOpen();
      FakeWebSocket.last.serverSend(welcome(service.clientId));
      expect(events).toHaveLength(1);
    });
  });

  describe('send()', () => {
    it('sends a JSON envelope when open', () => {
      const { service } = setup();
      service.connect();
      FakeWebSocket.last.serverOpen();
      const clientMessageId = crypto.randomUUID();

      service.send('chat.send', { clientMessageId, text: 'hi' });

      expect(FakeWebSocket.last.sent.map((s) => JSON.parse(s))).toEqual([
        { event: 'chat.send', data: { clientMessageId, text: 'hi' } },
      ]);
    });

    it.each<[string, (s: ChatSocketService) => void]>([
      ['idle', () => undefined],
      ['connecting', (s) => s.connect()],
      [
        'reconnecting',
        (s) => {
          s.connect();
          FakeWebSocket.last.serverOpen();
          FakeWebSocket.last.serverClose();
        },
      ],
    ])('throws SocketNotOpenError when %s', (state, arrange) => {
      const { service } = setup();
      arrange(service);
      expect(service.state()).toBe(state);
      expect(() =>
        service.send('chat.send', {
          clientMessageId: crypto.randomUUID(),
          text: 'x',
        }),
      ).toThrow(SocketNotOpenError);
    });
  });

  describe('clientId', () => {
    it('is created once and persisted', () => {
      const storage = memoryStorage();
      const { service } = setup(storage);
      expect(storage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(service.clientId);
    });

    it('reuses the stored id (identity survives a reload)', () => {
      const stored = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';
      const { service } = setup(
        memoryStorage({ [CLIENT_ID_STORAGE_KEY]: stored }),
      );
      expect(service.clientId).toBe(stored);
    });

    it('falls back to an in-memory id when storage is unavailable', () => {
      const { service } = setup(null);
      expect(service.clientId).toMatch(/^[0-9a-f-]{36}$/);
      service.connect();
      expect(FakeWebSocket.last.url).toContain(service.clientId);
    });
  });
});
