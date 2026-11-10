import { MessagingConnection } from '@realtime-chat/api-messaging';
import {
  createDomainEvent,
  DOMAIN_EVENTS,
  type DomainEvent,
  MESSAGING_HEADERS,
} from '@realtime-chat/contracts';
import type { Channel } from 'amqplib';
import {
  framesOf,
  type GatewayHarness,
  startGateway,
  until,
  wait,
} from '../testing/gateway-harness';
import { ConnectionRegistry } from './connection-registry';

/*
 * The WebSocket edge over RabbitMQ (see the harness): tickets, commands,
 * events to sockets, registry, broker loss.
 */

let h: GatewayHarness;
beforeAll(async () => {
  h = await startGateway();
});
afterAll(() => h.stop());

const open: GatewayHarness['open'] = (...args) => h.open(...args);
const openAs: GatewayHarness['openAs'] = (...args) => h.openAs(...args);
const ticketFor: GatewayHarness['ticketFor'] = (...args) =>
  h.ticketFor(...args);
const publish = (event: DomainEvent) => h.events.publish(event);

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
    expect(h.tickets.has(foreign)).toBe(true);
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
      message = await h.channel.get(h.topology.names.chatCommands, {
        noAck: true,
      });
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
    const registry = h.gateway.get(ConnectionRegistry);
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
    await h.gateway.get(MessagingConnection).close();
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
