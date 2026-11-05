import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MAX_TEXT_LENGTH,
  parseEnvelope,
  type ServerEnvelope,
} from '@realtime-chat/contracts';
import WebSocket from 'ws';
import { CLOSE_GOING_AWAY, ConnectionRegistry } from './connection-registry';
import { WS_MAX_PAYLOAD_BYTES } from './transport/chat-ws.adapter';

/*
 * End-to-end over a real socket: Nest app on a random port, configured exactly
 * like main.ts (configureApp), and `ws` clients.
 */

const ALLOWED_ORIGIN = 'http://localhost:4200';
const HEARTBEAT_MS = 100;

let app: INestApplication;
let appClosed: boolean;
let baseUrl: string;

beforeAll(() => {
  // Read by ConfigModule.forRoot when AppModule is imported (see startApp).
  process.env['WS_HEARTBEAT_MS'] = String(HEARTBEAT_MS);
  process.env['WS_ALLOWED_ORIGINS'] = `${ALLOWED_ORIGIN},http://localhost:4202`;
  process.env['WS_PATH'] = '/ws';
});

beforeEach(async () => {
  const [{ AppModule }, { configureApp }] = await Promise.all([
    import('../app/app.module'),
    import('../app/configure-app'),
  ]);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0);
  appClosed = false;
  const { port } = app.getHttpServer().address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${port}/ws`;
});

afterEach(async () => {
  if (!appClosed) await app.close();
});

// --- helpers ------------------------------------------------------------------

interface TestClient {
  socket: WebSocket;
  clientId: string;
  /** Resolves with the next server frame (already validated by the contracts). */
  next(): Promise<ServerEnvelope>;
  sendRaw(frame: string | Buffer): void;
  closed: Promise<{ code: number }>;
}

function connect(
  options: { clientId?: string; origin?: string; autoPong?: boolean } = {},
): Promise<TestClient> {
  const clientId = options.clientId ?? crypto.randomUUID();
  const socket = new WebSocket(`${baseUrl}?clientId=${clientId}`, {
    origin: options.origin ?? ALLOWED_ORIGIN,
    autoPong: options.autoPong ?? true,
  });

  const queue: ServerEnvelope[] = [];
  const waiters: ((e: ServerEnvelope) => void)[] = [];
  socket.on('message', (raw) => {
    const result = parseEnvelope(raw.toString(), 'server');
    if (!result.ok) throw new Error(`Server sent an invalid frame: ${raw}`);
    const waiter = waiters.shift();
    if (waiter) waiter(result.envelope);
    else queue.push(result.envelope);
  });
  const closed = new Promise<{ code: number }>((resolve) =>
    socket.on('close', (code) => resolve({ code })),
  );

  return new Promise((resolve, reject) => {
    socket.once('open', () =>
      resolve({
        socket,
        clientId,
        closed,
        sendRaw: (frame) => socket.send(frame),
        next: () =>
          new Promise((res, rej) => {
            const queued = queue.shift();
            if (queued) return res(queued);
            const timer = setTimeout(
              () => rej(new Error('Timed out waiting for a frame')),
              2000,
            );
            waiters.push((e) => {
              clearTimeout(timer);
              res(e);
            });
          }),
      }),
    );
    socket.once('error', reject);
  });
}

/** Opens a connection the server is expected to refuse during the upgrade. */
function expectRejectedUpgrade(url: string, origin?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : {});
    socket.on('open', () => reject(new Error('Upgrade was accepted')));
    socket.on('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      socket.terminate();
    });
    socket.on('error', () => undefined);
  });
}

const chatSend = (text: string, clientMessageId = crypto.randomUUID()) =>
  JSON.stringify({ event: 'chat.send', data: { clientMessageId, text } });

async function connectAndWelcome(
  options?: Parameters<typeof connect>[0],
): Promise<TestClient> {
  const client = await connect(options);
  const welcome = await client.next();
  expect(welcome.event).toBe('session.welcome');
  return client;
}

// --- tests --------------------------------------------------------------------

describe('ChatGateway (integration)', () => {
  it('sends session.welcome with the clientId and a guest nickname', async () => {
    const client = await connect();
    expect(await client.next()).toEqual({
      event: 'session.welcome',
      data: {
        clientId: client.clientId,
        nickname: `guest-${client.clientId.replace(/-/g, '').slice(0, 4)}`,
      },
    });
    client.socket.close();
  });

  it('broadcasts a message from A to both A and B with server id and sentAt', async () => {
    const a = await connectAndWelcome();
    const b = await connectAndWelcome();
    const clientMessageId = crypto.randomUUID();

    a.sendRaw(chatSend('  hello  ', clientMessageId));
    const [atA, atB] = await Promise.all([a.next(), b.next()]);

    expect(atA).toEqual(atB);
    expect(atA).toMatchObject({
      event: 'chat.message',
      data: {
        clientMessageId,
        senderId: a.clientId,
        text: 'hello',
      },
    });
    if (atA.event !== 'chat.message') throw new Error('unreachable');
    expect(atA.data.id).not.toBe(clientMessageId);
    expect(Date.now() - Date.parse(atA.data.sentAt)).toBeLessThan(5000);

    a.socket.close();
    b.socket.close();
  });

  it.each([
    ['invalid JSON', '{nope', 'INVALID_PAYLOAD'],
    ['an invalid payload', chatSend(''), 'INVALID_PAYLOAD'],
    [
      'an unknown event',
      JSON.stringify({ event: 'chat.nope', data: {} }),
      'UNKNOWN_EVENT',
    ],
    [
      'a too-long text',
      chatSend('a'.repeat(MAX_TEXT_LENGTH + 1)),
      'MESSAGE_TOO_LONG',
    ],
  ])(
    'answers %s with system.error to the sender only and keeps the connection',
    async (_label, frame, code) => {
      const a = await connectAndWelcome();
      const b = await connectAndWelcome();

      a.sendRaw(frame);
      expect(await a.next()).toMatchObject({
        event: 'system.error',
        data: { code },
      });

      // Still alive: a valid message goes through afterwards…
      a.sendRaw(chatSend('still here'));
      expect(await a.next()).toMatchObject({ event: 'chat.message' });
      // …and B never saw the error, only the valid message.
      expect(await b.next()).toMatchObject({
        event: 'chat.message',
        data: { text: 'still here' },
      });
      expect(a.socket.readyState).toBe(WebSocket.OPEN);

      a.socket.close();
      b.socket.close();
    },
  );

  it.each([
    ['a foreign origin', 'http://evil.example'],
    ['no origin', undefined],
  ])('rejects an upgrade from %s with 403', async (_label, origin) => {
    const status = await expectRejectedUpgrade(
      `${baseUrl}?clientId=${crypto.randomUUID()}`,
      origin,
    );
    expect(status).toBe(403);
    expect(app.get(ConnectionRegistry).size).toBe(0);
  });

  it.each([
    ['a non-uuid clientId', '?clientId=abc'],
    ['a missing clientId', ''],
  ])('rejects an upgrade with %s with 400', async (_label, query) => {
    expect(
      await expectRejectedUpgrade(`${baseUrl}${query}`, ALLOWED_ORIGIN),
    ).toBe(400);
  });

  it('closes the connection (1009) for a frame larger than maxPayload', async () => {
    const client = await connectAndWelcome();
    client.sendRaw(Buffer.alloc(WS_MAX_PAYLOAD_BYTES + 1, 'a'));
    expect((await client.closed).code).toBe(1009);
  });

  it('terminates a client that stops answering pings, keeps the others', async () => {
    const registry = app.get(ConnectionRegistry);
    const healthy = await connectAndWelcome();
    const dead = await connectAndWelcome({ autoPong: false });
    expect(registry.size).toBe(2);

    // Terminated (no close frame → 1006) after missing one ping.
    expect((await dead.closed).code).toBe(1006);
    await vi.waitFor(() => expect(registry.size).toBe(1));

    await new Promise((r) => setTimeout(r, HEARTBEAT_MS * 3));
    expect(healthy.socket.readyState).toBe(WebSocket.OPEN);
    healthy.socket.close();
  });

  it('unregisters a client when it disconnects', async () => {
    const registry = app.get(ConnectionRegistry);
    const client = await connectAndWelcome();
    expect(registry.size).toBe(1);
    client.socket.close();
    await vi.waitFor(() => expect(registry.size).toBe(0));
  });

  it('closes open connections with 1001 when the app shuts down', async () => {
    const client = await connectAndWelcome();
    await app.close();
    appClosed = true;
    expect((await client.closed).code).toBe(CLOSE_GOING_AWAY);
  });
});
