import { Controller, type INestApplication, Logger } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  type MicroserviceOptions,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ChatService } from '@realtime-chat/api-chat';
import {
  AmqpEventPublisher,
  CommandPublisher,
  commandServerOptions,
  createRpcClient,
  eventServerOptions,
  handleRpc,
  MESSAGING_OPTIONS,
  MessagingConnection,
  type RpcClient,
  rpcServerOptions,
  type TopologySettings,
  topologyNames,
  withDefaults,
} from '@realtime-chat/api-messaging';
import {
  AppError,
  type ChatSendCommand,
  createDomainEvent,
  DOMAIN_EVENTS,
  type DomainEvent,
  RPC_PATTERNS,
  type UserSummary,
} from '@realtime-chat/contracts';
import { type Channel, type ChannelModel, connect } from 'amqplib';
import { testRabbitUrl } from '../../../tools/db/env.mjs';
import { AppModule } from './app/app.module';

/*
 * chat-service end to end over RabbitMQ: the real AppModule on chat_test, an
 * exchange / queues of its own (random prefix), and a fake auth-service
 * answering auth.users.summaries (to see when chat reads users through).
 */

Logger.overrideLogger(false);

const url = testRabbitUrl();
const prefix = `test.${crypto.randomUUID().slice(0, 8)}.`;
const topology: TopologySettings = {
  names: topologyNames(prefix),
  retryDelayMs: 300,
};
const names = topology.names;

// --- fake auth-service -----------------------------------------------------------

const authUsers = new Map<string, UserSummary>();
let authLookups = 0;

@Controller()
class FakeAuthController {
  @MessagePattern(RPC_PATTERNS.authUsersSummaries)
  summaries(@Payload() data: unknown, @Ctx() rawContext: unknown) {
    return handleRpc(
      RPC_PATTERNS.authUsersSummaries,
      data,
      rawContext as RmqContext,
      new Logger('fake-auth'),
      async ({ ids }) => {
        authLookups += 1;
        return ids.flatMap((id) => authUsers.get(id) ?? []);
      },
    );
  }
}

function authUser(name: string): UserSummary {
  const user = {
    id: crypto.randomUUID(),
    username: `${name}_${crypto.randomUUID().slice(0, 4)}`,
    displayName: name,
  };
  authUsers.set(user.id, user);
  return user;
}

// --- setup -------------------------------------------------------------------------

let app: INestApplication;
let fakeAuth: INestApplication;
let rpc: RpcClient;
let connection: MessagingConnection;
let amqp: ChannelModel;
let channel: Channel;
const published: DomainEvent[] = [];

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
        connectionName: 'chat-service-test',
        topology,
        rpcTimeoutMs: 3000,
        shutdownGraceMs: 1000,
      }),
    )
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  for (const options of [
    rpcServerOptions(url, topology, 'chatRpc'),
    commandServerOptions(url, topology),
    eventServerOptions(url, topology, { durableQueue: 'chatUserSync' }),
  ]) {
    app.connectMicroservice<MicroserviceOptions>(options);
  }
  await app.init();
  connection = app.get(MessagingConnection);
  await connection.whenReady();
  await app.startAllMicroservices();

  rpc = createRpcClient({ url, topology, timeoutMs: 3000 }, 'chatRpc');

  amqp = await connect(url);
  channel = await amqp.createChannel();
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, names.exchange, 'chat.#');
  await channel.consume(
    queue,
    (message) => {
      if (message) published.push(JSON.parse(message.content.toString()).data);
    },
    { noAck: true },
  );
});

afterAll(async () => {
  await rpc.close();
  await app.close();
  await fakeAuth.close();
  for (const [key, name] of Object.entries(names)) {
    if (key === 'exchange') await channel.deleteExchange(name);
    else await channel.deleteQueue(name);
  }
  await amqp.close();
});

// --- helpers -----------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await wait(25);
  }
}

const eventsOf = (correlationId: string) =>
  published.filter((event) => event.correlationId === correlationId);

async function dm(a: UserSummary, b: UserSummary) {
  const { conversation } = await rpc.call(
    RPC_PATTERNS.chatConversationsCreate,
    { userId: a.id, request: { type: 'dm', userId: b.id } },
    crypto.randomUUID(),
  );
  return conversation;
}

const command = (
  userId: string,
  conversationId: string,
  text: string,
  clientMessageId = crypto.randomUUID(),
): ChatSendCommand => ({
  userId,
  conversationId,
  clientMessageId,
  text,
  requestedAt: new Date().toISOString(),
});

const send = (cmd: ChatSendCommand, correlationId: string) =>
  new CommandPublisher(connection, names).sendChat(cmd, correlationId);

async function queueCount(queue: string): Promise<number> {
  return (await channel.checkQueue(queue)).messageCount;
}

// --- users -------------------------------------------------------------------------

describe('users', () => {
  it('learns users from auth.user.registered, then needs no lookup', async () => {
    const ann = authUser('Ann');
    const ben = authUser('Ben');
    const publisher = new AmqpEventPublisher(connection, names);
    for (const user of [ann, ben]) {
      await publisher.publish(
        createDomainEvent(
          DOMAIN_EVENTS.userRegistered,
          {
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
          },
          'corr-sync',
        ),
      );
    }
    // Once both events are consumed (and acked), creating the DM asks nobody.
    const deadline = Date.now() + 5000;
    while (
      (await queueCount(names.chatUserSync)) > 0 &&
      Date.now() < deadline
    ) {
      await wait(25);
    }
    await wait(200); // the last ack may still be on its way
    const before = authLookups;
    const conversation = await dm(ann, ben);
    expect(conversation.members.map((m) => m.displayName).sort()).toEqual([
      'Ann',
      'Ben',
    ]);
    expect(authLookups).toBe(before);
  });

  it('reads through to auth-service for a user it has never seen, once', async () => {
    const cat = authUser('Cat');
    const dan = authUser('Dan');
    const before = authLookups;
    await dm(cat, dan);
    expect(authLookups).toBeGreaterThan(before);
    const after = authLookups;
    await rpc.call(RPC_PATTERNS.chatConversationsList, { userId: cat.id }, 'c');
    expect(authLookups).toBe(after);
  });

  it('refuses a DM with someone auth-service does not know either', async () => {
    const eve = authUser('Eve');
    const error = await rpc
      .call(
        RPC_PATTERNS.chatConversationsCreate,
        {
          userId: eve.id,
          request: { type: 'dm', userId: crypto.randomUUID() },
        },
        'c',
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('VALIDATION_FAILED');
  });
});

// --- conversations and messages ------------------------------------------------------

describe('chat.send commands', () => {
  it('stores a message and announces it to every member', async () => {
    const [ann, ben] = [authUser('Ann'), authUser('Ben')];
    const conversation = await dm(ann, ben);

    await send(command(ann.id, conversation.id, 'hello'), 'corr-send-1');
    await until(() => eventsOf('corr-send-1').length > 0);
    const [event] = eventsOf('corr-send-1');
    expect(event).toMatchObject({
      type: DOMAIN_EVENTS.messageCreated,
      payload: {
        message: { conversationId: conversation.id, seq: 1, text: 'hello' },
      },
    });
    expect(
      event.type === DOMAIN_EVENTS.messageCreated &&
        [...event.payload.recipientUserIds].sort(),
    ).toEqual([ann.id, ben.id].sort());
  });

  it('a resent clientMessageId stores nothing new, but the event comes again', async () => {
    const [ann, ben] = [authUser('Ann'), authUser('Ben')];
    const conversation = await dm(ann, ben);
    const first = command(ann.id, conversation.id, 'once');
    await send(first, 'corr-once-1');
    await send({ ...first, text: 'once' }, 'corr-once-2');
    await until(
      () =>
        eventsOf('corr-once-1').length > 0 &&
        eventsOf('corr-once-2').length > 0,
    );
    const ids = [...eventsOf('corr-once-1'), ...eventsOf('corr-once-2')].map(
      (e) => e.type === DOMAIN_EVENTS.messageCreated && e.payload.message.id,
    );
    expect(new Set(ids).size).toBe(1);

    const page = await rpc.call(
      RPC_PATTERNS.chatMessagesList,
      { userId: ben.id, conversationId: conversation.id },
      'c',
    );
    expect(page.items.map((m) => m.text)).toEqual(['once']);
  });

  it('rejects an outsider with NOT_A_MEMBER, without retrying', async () => {
    const [ann, ben, eve] = [authUser('Ann'), authUser('Ben'), authUser('Eve')];
    const conversation = await dm(ann, ben);
    const intrusion = command(eve.id, conversation.id, 'let me in');
    await send(intrusion, 'corr-outsider');
    await until(() => eventsOf('corr-outsider').length > 0);
    await wait(700); // longer than the retry delay
    expect(eventsOf('corr-outsider')).toHaveLength(1);
    expect(eventsOf('corr-outsider')[0]).toMatchObject({
      type: DOMAIN_EVENTS.messageRejected,
      payload: {
        userId: eve.id,
        clientMessageId: intrusion.clientMessageId,
        code: 'NOT_A_MEMBER',
      },
    });
    expect(await queueCount(names.chatCommandsRetry)).toBe(0);
  });

  it('retries a transient failure, then dead-letters it and tells the sender', async () => {
    const [ann, ben] = [authUser('Ann'), authUser('Ben')];
    const conversation = await dm(ann, ben);
    const chat = app.get(ChatService);
    const original = chat.sendMessage.bind(chat);
    let attempts = 0;
    const spy = vi
      .spyOn(chat, 'sendMessage')
      .mockImplementation((input, id) => {
        if (input.text !== 'doomed') return original(input, id);
        attempts += 1;
        return Promise.reject(new Error('database unavailable'));
      });
    try {
      const doomed = command(ann.id, conversation.id, 'doomed');
      await send(doomed, 'corr-doomed');
      await until(() => eventsOf('corr-doomed').length > 0);
      expect(attempts).toBe(3);
      expect(eventsOf('corr-doomed')[0]).toMatchObject({
        type: DOMAIN_EVENTS.messageRejected,
        payload: {
          clientMessageId: doomed.clientMessageId,
          code: 'SEND_FAILED',
        },
      });
      expect(await queueCount(names.chatCommandsDlq)).toBe(1);
      await wait(700);
      expect(attempts).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('announces a new group to its members', async () => {
    const [ann, ben, cat] = [authUser('Ann'), authUser('Ben'), authUser('Cat')];
    const { conversation, created } = await rpc.call(
      RPC_PATTERNS.chatConversationsCreate,
      {
        userId: ann.id,
        request: { type: 'group', name: 'Trip', memberIds: [ben.id, cat.id] },
      },
      'corr-group',
    );
    expect(created).toBe(true);
    await until(() => eventsOf('corr-group').length > 0);
    const [event] = eventsOf('corr-group');
    expect(event.type).toBe(DOMAIN_EVENTS.conversationCreated);
    expect(
      event.type === DOMAIN_EVENTS.conversationCreated &&
        [...event.payload.recipientUserIds].sort(),
    ).toEqual([ann.id, ben.id, cat.id].sort());
    expect(
      event.type === DOMAIN_EVENTS.conversationCreated &&
        event.payload.conversation.id,
    ).toBe(conversation.id);
  });
});
