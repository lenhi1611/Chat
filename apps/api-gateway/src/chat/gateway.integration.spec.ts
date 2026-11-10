import { Controller, type INestApplication, Logger } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  type MicroserviceOptions,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import {
  AmqpEventPublisher,
  handleRpc,
  MESSAGING_OPTIONS,
  MessagingConnection,
  rpcServerOptions,
  type TopologySettings,
  topologyNames,
  withDefaults,
} from '@realtime-chat/api-messaging';
import {
  AppError,
  createDomainEvent,
  DOMAIN_EVENTS,
  type DomainEvent,
  MESSAGING_HEADERS,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';
import { type Channel, type ChannelModel, connect } from 'amqplib';
import { WebSocket } from 'ws';
import { testRabbitUrl } from '../../../../tools/db/env.mjs';
import { AppModule } from '../app/app.module';
import { configureApp, connectGatewayEvents } from '../app/configure-app';
import { ConnectionRegistry } from './connection-registry';

/*
 * The WebSocket edge over RabbitMQ: the real gateway on a random port, a fake
 * auth-service consuming tickets, events published straight to this run's
 * exchange, commands read from this run's queue (random prefix).
 */

Logger.overrideLogger(false);

const url = testRabbitUrl();
const prefix = `test.${crypto.randomUUID().slice(0, 8)}.`;
const topology: TopologySettings = {
  names: topologyNames(prefix),
  retryDelayMs: 300,
};
const names = topology.names;
const ORIGIN = 'http://localhost:4200';

// --- fake auth-service: single-use tickets -------------------------------------------

const tickets = new Map<string, { userId: string; sid: string }>();

@Controller()
class FakeAuthController {
  @MessagePattern(RPC_PATTERNS.authWsTicketConsume)
  consume(@Payload() data: unknown, @Ctx() context: unknown) {
    return handleRpc(
      RPC_PATTERNS.authWsTicketConsume,
      data,
      context as RmqContext,
      new Logger('fake-auth'),
      async ({ ticket }) => {
        if (ticket === 'auth-is-broken') {
          throw new AppError('SERVICE_UNAVAILABLE', 'down');
        }
        const owner = tickets.get(ticket) ?? null;
        tickets.delete(ticket);
        return { owner };
      },
    );
  }
}

function ticketFor(userId: string, sid: string): string {
  const ticket = crypto.randomUUID();
  tickets.set(ticket, { userId, sid });
  return ticket;
}

// --- setup ---------------------------------------------------------------------------

let gateway: INestApplication;
let fakeAuth: INestApplication;
let wsUrl: string;
let amqp: ChannelModel;
let channel: Channel;
let events: AmqpEventPublisher;

beforeAll(async () => {
  const fakeModule = await Test.createTestingModule({
    controllers: [FakeAuthController],
  }).compile();
  fakeAuth = fakeModule.createNestApplication({ logger: false });
  fakeAuth.connectMicroservice<MicroserviceOptions>(
    rpcServerOptions(url, topology, 'authRpc'),
  );
  await fakeAuth.init();
  await fakeAuth.startAllMicroservices();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MESSAGING_OPTIONS)
    .useValue(
      withDefaults({
        url,
        connectionName: 'gateway-test',
        topology,
        rpcTimeoutMs: 3000,
        shutdownGraceMs: 500,
      }),
    )
    .compile();
  gateway = moduleRef.createNestApplication({ logger: false });
  configureApp(gateway);
  connectGatewayEvents(gateway, `test-${crypto.randomUUID().slice(0, 6)}`);
  await gateway.listen(0);
  await gateway.startAllMicroservices();
  await gateway.get(MessagingConnection).whenReady();
  const address = gateway.getHttpServer().address() as { port: number };
  wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  amqp = await connect(url);
  channel = await amqp.createChannel();
  events = new AmqpEventPublisher(gateway.get(MessagingConnection), names);
});

afterAll(async () => {
  await gateway.close();
  await fakeAuth.close();
  for (const [key, name] of Object.entries(names)) {
    if (key === 'exchange') await channel.deleteExchange(name);
    else await channel.deleteQueue(name);
  }
  await amqp.close();
});

// --- helpers -------------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await wait(20);
  }
}

interface Client {
  socket: WebSocket;
  frames: { event: string; data: Record<string, unknown> }[];
  closeCode?: number;
}

/** Opens a socket; resolves after session.welcome, or with the HTTP refusal. */
function open(
  ticket: string | null,
  origin = ORIGIN,
): Promise<Client | { refused: number }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      ticket === null ? wsUrl : `${wsUrl}?ticket=${encodeURIComponent(ticket)}`,
      { origin },
    );
    const client: Client = { socket, frames: [] };
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      client.frames.push(frame);
      if (frame.event === 'session.welcome') resolve(client);
    });
    socket.on('close', (code) => {
      client.closeCode = code;
    });
    socket.on('unexpected-response', (_req, res) =>
      resolve({ refused: res.statusCode ?? 0 }),
    );
    socket.on('error', () => undefined);
  });
}

async function openAs(userId: string, sid = crypto.randomUUID()) {
  const result = await open(ticketFor(userId, sid));
  if ('refused' in result) throw new Error(`refused ${result.refused}`);
  return result;
}

const framesOf = (client: Client, event: string) =>
  client.frames.filter((frame) => frame.event === event);

const publish = (event: DomainEvent) => events.publish(event);

// --- tests ---------------------------------------------------------------------------

describe('upgrade', () => {
  it('accepts a valid ticket once; refuses reused, unknown, missing and foreign-origin ones', async () => {
    const userId = crypto.randomUUID();
    const ticket = ticketFor(userId, crypto.randomUUID());
    const first = await open(ticket);
    expect(
      'socket' in first && framesOf(first, 'session.welcome')[0].data,
    ).toEqual({ userId });

    expect(await open(ticket)).toEqual({ refused: 401 });
    expect(await open('never-issued')).toEqual({ refused: 401 });
    expect(await open(null)).toEqual({ refused: 401 });
    const foreign = ticketFor(userId, crypto.randomUUID());
    expect(await open(foreign, 'https://evil.example')).toEqual({
      refused: 403,
    });
    // Refused on Origin before the ticket was looked at: still usable.
    expect(tickets.has(foreign)).toBe(true);
    if ('socket' in first) first.socket.close();
  });

  it('answers 503 when auth-service cannot check the ticket', async () => {
    expect(await open('auth-is-broken')).toEqual({ refused: 503 });
  });
});

describe('chat.send → command', () => {
  it('queues the frame for chat-service with the sender taken from the socket', async () => {
    const userId = crypto.randomUUID();
    const client = await openAs(userId);
    const payload = {
      conversationId: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      text: '  hello  ',
    };
    client.socket.send(JSON.stringify({ event: 'chat.send', data: payload }));

    let message: Awaited<ReturnType<Channel['get']>> = false;
    const deadline = Date.now() + 5000;
    while (!message && Date.now() < deadline) {
      message = await channel.get(names.chatCommands, { noAck: true });
      if (!message) await wait(20);
    }
    expect(message).not.toBe(false);
    if (!message) return;
    const packet = JSON.parse(message.content.toString());
    expect(packet.pattern).toBe('chat.send');
    expect(packet.data).toMatchObject({ ...payload, text: 'hello', userId });
    expect(message.properties.deliveryMode).toBe(2); // persistent
    expect(
      message.properties.headers?.[MESSAGING_HEADERS.correlationId],
    ).toBeTruthy();
    // Nothing is stored or echoed by the gateway itself.
    await wait(100);
    expect(framesOf(client, 'chat.message')).toEqual([]);
    client.socket.close();
  });
});

describe('events → sockets', () => {
  it('delivers a message to every socket of its recipients only', async () => {
    const [ann, ben, eve] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    const annTab1 = await openAs(ann);
    const annTab2 = await openAs(ann);
    const benTab = await openAs(ben);
    const eveTab = await openAs(eve);
    const message = {
      id: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      seq: 1,
      clientMessageId: crypto.randomUUID(),
      senderId: ann,
      text: 'hi',
      sentAt: new Date().toISOString(),
    };
    await publish(
      createDomainEvent(
        DOMAIN_EVENTS.messageCreated,
        { message, recipientUserIds: [ann, ben] },
        'c1',
      ),
    );
    await until(() =>
      [annTab1, annTab2, benTab].every(
        (c) => framesOf(c, 'chat.message').length === 1,
      ),
    );
    expect(framesOf(benTab, 'chat.message')[0].data).toEqual(message);
    await wait(150);
    expect(framesOf(eveTab, 'chat.message')).toEqual([]);

    const conversation = {
      id: crypto.randomUUID(),
      type: 'dm' as const,
      name: null,
      members: [
        { id: ann, username: 'ann', displayName: 'Ann' },
        { id: ben, username: 'ben', displayName: 'Ben' },
      ],
      lastMessage: null,
      createdAt: new Date().toISOString(),
    };
    await publish(
      createDomainEvent(
        DOMAIN_EVENTS.conversationCreated,
        { conversation, recipientUserIds: [ann, ben] },
        'c2',
      ),
    );
    await until(() => framesOf(benTab, 'conversation.created').length === 1);
    expect(framesOf(eveTab, 'conversation.created')).toEqual([]);
    for (const c of [annTab1, annTab2, benTab, eveTab]) c.socket.close();
  });

  it('tells only the sender about a rejected message', async () => {
    const [ann, ben] = [crypto.randomUUID(), crypto.randomUUID()];
    const annTab = await openAs(ann);
    const benTab = await openAs(ben);
    const clientMessageId = crypto.randomUUID();
    await publish(
      createDomainEvent(
        DOMAIN_EVENTS.messageRejected,
        {
          userId: ann,
          conversationId: crypto.randomUUID(),
          clientMessageId,
          code: 'NOT_A_MEMBER',
          message: 'You are not a member of this conversation',
        },
        'c3',
      ),
    );
    await until(() => framesOf(annTab, 'system.error').length === 1);
    expect(framesOf(annTab, 'system.error')[0].data).toEqual({
      code: 'NOT_A_MEMBER',
      message: 'You are not a member of this conversation',
      clientMessageId,
    });
    await wait(150);
    expect(framesOf(benTab, 'system.error')).toEqual([]);
    annTab.socket.close();
    benTab.socket.close();
  });

  it('closes the sockets of a revoked session with 4401, and only those', async () => {
    const userId = crypto.randomUUID();
    const [revoked, other] = [crypto.randomUUID(), crypto.randomUUID()];
    const tabA = await openAs(userId, revoked);
    const tabB = await openAs(userId, revoked);
    const otherDevice = await openAs(userId, other);
    await publish(
      createDomainEvent(
        DOMAIN_EVENTS.sessionRevoked,
        { userId, sid: revoked },
        'c4',
      ),
    );
    await until(
      () => tabA.closeCode !== undefined && tabB.closeCode !== undefined,
    );
    expect([tabA.closeCode, tabB.closeCode]).toEqual([4401, 4401]);
    await wait(150);
    expect(otherDevice.closeCode).toBeUndefined();
    otherDevice.socket.close();
  });
});

describe('registry', () => {
  it('leaks nothing after many sockets come and go', async () => {
    const registry = gateway.get(ConnectionRegistry);
    await until(() => registry.size === 0);
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => openAs(crypto.randomUUID())),
    );
    expect(registry.stats().sockets).toBe(20);
    for (const client of clients) client.socket.close();
    await until(() => registry.size === 0);
    expect(registry.stats()).toEqual({ sockets: 0, users: 0, sessions: 0 });
  });
});

describe('RabbitMQ unavailable', () => {
  it('answers SEND_FAILED at once when the command cannot be queued', async () => {
    const client = await openAs(crypto.randomUUID());
    // The gateway loses its publishing connection.
    await gateway.get(MessagingConnection).close();
    const clientMessageId = crypto.randomUUID();
    client.socket.send(
      JSON.stringify({
        event: 'chat.send',
        data: {
          conversationId: crypto.randomUUID(),
          clientMessageId,
          text: 'lost',
        },
      }),
    );
    await until(() => framesOf(client, 'system.error').length === 1);
    expect(framesOf(client, 'system.error')[0].data).toMatchObject({
      code: 'SEND_FAILED',
      clientMessageId,
    });
    client.socket.close();
  });
});
