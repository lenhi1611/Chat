import { type INestApplication, Logger } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import {
  createRpcClient,
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
  type AuthSessionDto,
  DOMAIN_EVENTS,
  type DomainEvent,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';
import { type Channel, type ChannelModel, connect } from 'amqplib';
import { testRabbitUrl } from '../../../tools/db/env.mjs';
import { AppModule } from './app/app.module';

/*
 * auth-service end to end over RabbitMQ: the real AppModule on auth_test,
 * Redis db 15, and an exchange / queues of its own (random prefix).
 */

Logger.overrideLogger(false);

const url = testRabbitUrl();
const prefix = `test.${crypto.randomUUID().slice(0, 8)}.`;
const topology: TopologySettings = {
  names: topologyNames(prefix),
  retryDelayMs: 300,
};

let app: INestApplication;
let rpc: RpcClient;
let amqp: ChannelModel;
let events: Channel;
const published: DomainEvent[] = [];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MESSAGING_OPTIONS)
    .useValue(
      withDefaults({
        url,
        connectionName: 'auth-service-test',
        topology,
        rpcTimeoutMs: 5000,
      }),
    )
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.connectMicroservice<MicroserviceOptions>(
    rpcServerOptions(url, topology, 'authRpc'),
  );
  await app.init();
  await app.startAllMicroservices();
  await app.get(MessagingConnection).whenReady();

  rpc = createRpcClient({ url, topology, timeoutMs: 5000 }, 'authRpc');

  // Everything published on this run's exchange.
  amqp = await connect(url);
  events = await amqp.createChannel();
  const { queue } = await events.assertQueue('', { exclusive: true });
  await events.bindQueue(queue, topology.names.exchange, '#');
  await events.consume(
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
  for (const [key, name] of Object.entries(topology.names)) {
    if (key === 'exchange') await events.deleteExchange(name);
    else await events.deleteQueue(name);
  }
  await amqp.close();
});

let seq = 0;
function identity() {
  seq += 1;
  const tag = `${crypto.randomUUID().slice(0, 6)}${seq}`;
  return {
    email: `svc_${tag}@example.test`,
    username: `svc_${tag}`,
    displayName: `Service ${tag}`,
    password: 'service-test-password',
  };
}

const errorCode = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) =>
      error instanceof AppError ? error.code : String(error),
  );

async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('not in time');
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function register(): Promise<AuthSessionDto> {
  return rpc.call(RPC_PATTERNS.authRegister, identity(), crypto.randomUUID());
}

describe('sessions', () => {
  it('register → login → refresh → logout, with their events', async () => {
    const user = identity();
    const registered = await rpc.call(
      RPC_PATTERNS.authRegister,
      user,
      'corr-register',
    );
    expect(registered.user.username).toBe(user.username);
    expect(registered.refreshToken).toBeTruthy();
    await eventually(() =>
      published.some((e) => e.correlationId === 'corr-register'),
    );
    expect(
      published.find((e) => e.correlationId === 'corr-register'),
    ).toMatchObject({
      type: DOMAIN_EVENTS.userRegistered,
      payload: {
        userId: registered.user.id,
        username: user.username,
        displayName: user.displayName,
      },
    });

    const login = await rpc.call(
      RPC_PATTERNS.authLogin,
      { email: user.email.toUpperCase(), password: user.password },
      'c',
    );
    expect(login.user.id).toBe(registered.user.id);
    expect(login.sid).not.toBe(registered.sid);

    const refreshed = await rpc.call(
      RPC_PATTERNS.authRefresh,
      { refreshToken: login.refreshToken },
      'c',
    );
    expect(refreshed.sid).toBe(login.sid);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    const me = await rpc.call(
      RPC_PATTERNS.authMe,
      { userId: login.user.id },
      'c',
    );
    expect(me.email).toBe(user.email);

    const logout = await rpc.call(
      RPC_PATTERNS.authLogout,
      { refreshToken: refreshed.refreshToken },
      'corr-logout',
    );
    expect(logout.session).toEqual({ userId: login.user.id, sid: login.sid });
    await eventually(() =>
      published.some((e) => e.correlationId === 'corr-logout'),
    );
    expect(
      published.find((e) => e.correlationId === 'corr-logout'),
    ).toMatchObject({
      type: DOMAIN_EVENTS.sessionRevoked,
      payload: { userId: login.user.id, sid: login.sid },
    });
    expect(
      await errorCode(
        rpc.call(
          RPC_PATTERNS.authRefresh,
          { refreshToken: refreshed.refreshToken },
          'c',
        ),
      ),
    ).toBe('INVALID_REFRESH_TOKEN');
  });

  it('answers domain errors with their code', async () => {
    const user = identity();
    await rpc.call(RPC_PATTERNS.authRegister, user, 'c');
    expect(
      await errorCode(
        rpc.call(
          RPC_PATTERNS.authRegister,
          { ...identity(), email: user.email },
          'c',
        ),
      ),
    ).toBe('EMAIL_TAKEN');
    expect(
      await errorCode(
        rpc.call(
          RPC_PATTERNS.authLogin,
          { email: user.email, password: 'wrong-password' },
          'c',
        ),
      ),
    ).toBe('INVALID_CREDENTIALS');
    expect(await errorCode(rpc.call(RPC_PATTERNS.authRefresh, {}, 'c'))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
    expect(
      await errorCode(
        rpc.call(
          RPC_PATTERNS.authRegister,
          { ...identity(), password: 'short' },
          'c',
        ),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(
      await errorCode(
        rpc.call(RPC_PATTERNS.authMe, { userId: crypto.randomUUID() }, 'c'),
      ),
    ).toBe('UNAUTHENTICATED');
  });
});

describe('WebSocket tickets', () => {
  it('can be consumed exactly once', async () => {
    const session = await register();
    const owner = { userId: session.user.id, sid: session.sid };
    const { ticket } = await rpc.call(
      RPC_PATTERNS.authWsTicketIssue,
      owner,
      'c',
    );

    const first = await rpc.call(
      RPC_PATTERNS.authWsTicketConsume,
      { ticket },
      'c',
    );
    expect(first.owner).toEqual(owner);
    const again = await rpc.call(
      RPC_PATTERNS.authWsTicketConsume,
      { ticket },
      'c',
    );
    expect(again.owner).toBeNull();
  });

  it('are refused for a session that has ended, even if issued before', async () => {
    const session = await register();
    const owner = { userId: session.user.id, sid: session.sid };
    const { ticket } = await rpc.call(
      RPC_PATTERNS.authWsTicketIssue,
      owner,
      'c',
    );

    await rpc.call(
      RPC_PATTERNS.authLogout,
      { refreshToken: session.refreshToken },
      'c',
    );

    const consumed = await rpc.call(
      RPC_PATTERNS.authWsTicketConsume,
      { ticket },
      'c',
    );
    expect(consumed.owner).toBeNull();
    expect(
      await errorCode(rpc.call(RPC_PATTERNS.authWsTicketIssue, owner, 'c')),
    ).toBe('UNAUTHENTICATED');
  });
});

describe('users and health', () => {
  it('searches, summarises and pings', async () => {
    const a = await register();
    const b = await register();
    const found = await rpc.call(
      RPC_PATTERNS.authUsersSearch,
      { userId: a.user.id, q: b.user.username },
      'c',
    );
    expect(found.map((u) => u.id)).toEqual([b.user.id]);

    const summaries = await rpc.call(
      RPC_PATTERNS.authUsersSummaries,
      { ids: [a.user.id, b.user.id, crypto.randomUUID()] },
      'c',
    );
    expect(summaries.map((u) => u.id).sort()).toEqual(
      [a.user.id, b.user.id].sort(),
    );

    const pong = await rpc.call(RPC_PATTERNS.authPing, {}, 'c');
    expect(pong.service).toBe('auth');
  });
});
