import { Controller, type INestApplication, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  MessagePattern,
  type MicroserviceOptions,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import {
  AppError,
  type ChatSendCommand,
  chatSendCommandSchema,
  COMMAND_PATTERNS,
  createDomainEvent,
  DOMAIN_EVENTS,
  type DomainEvent,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';
import { connect as amqpConnect } from 'amqplib';
import { testRabbitUrl } from '../../../../../tools/db/env.mjs';
import { MessagingConnection } from './connection';
import {
  commandServerOptions,
  consumeCommand,
  consumeEvent,
  eventServerOptions,
  InflightTracker,
  PermanentCommandError,
} from './consumers';
import { AmqpEventPublisher, CommandPublisher } from './publishers';
import { createRpcClient, handleRpc, rpcServerOptions } from './rpc';
import { type TopologySettings, topologyNames } from './topology';

/*
 * Against the RabbitMQ of `npm run infra:up`, on exchange and queues of their
 * own (random prefix), deleted afterwards.
 */

const url = testRabbitUrl();
const prefix = `test.${crypto.randomUUID().slice(0, 8)}.`;
const topology: TopologySettings = {
  names: topologyNames(prefix),
  retryDelayMs: 300,
};
const names = topology.names;
const logger = new Logger('test');
// The reconnect warnings of the offline test etc. are expected: keep output clean.
Logger.overrideLogger(false);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await wait(25);
  }
}

let connection: MessagingConnection;
const apps: INestApplication[] = [];

/** A Nest app with one RMQ server, like the services will be. */
async function startServer(
  controller: new (...args: never[]) => unknown,
  options: MicroserviceOptions,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.connectMicroservice(options);
  await app.startAllMicroservices();
  await app.init();
  apps.push(app);
  return app;
}

beforeAll(async () => {
  connection = new MessagingConnection({
    url,
    name: 'messaging-test',
    topology,
    publishTimeoutMs: 2000,
  });
  await connection.whenReady();
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

afterAll(async () => {
  await connection.close();
  // Remove this run's exchange and queues.
  const raw = await amqpConnect(url);
  const channel = await raw.createChannel();
  for (const [key, name] of Object.entries(names)) {
    if (key === 'exchange') await channel.deleteExchange(name);
    else await channel.deleteQueue(name);
  }
  await raw.close();
});

// --- RPC -------------------------------------------------------------------------

const rpcCalls: { correlationId: string }[] = [];

@Controller()
class AuthRpcController {
  @MessagePattern(RPC_PATTERNS.authPing)
  ping(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authPing,
      data,
      context,
      logger,
      async (_, meta) => {
        rpcCalls.push(meta);
        return { service: 'auth' as const, at: new Date().toISOString() };
      },
    );
  }

  @MessagePattern(RPC_PATTERNS.authMe)
  me(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(RPC_PATTERNS.authMe, data, context, logger, async () => {
      throw new AppError('UNAUTHENTICATED', 'User no longer exists');
    });
  }

  @MessagePattern(RPC_PATTERNS.authUsersSummaries)
  summaries(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.authUsersSummaries,
      data,
      context,
      logger,
      async () => {
        throw new Error('database exploded');
      },
    );
  }
}

describe('RPC', () => {
  it('round-trips with the correlation id, and maps errors back to their code', async () => {
    await startServer(
      AuthRpcController,
      rpcServerOptions(url, topology, 'authRpc'),
    );
    const client = createRpcClient(
      { url, topology, timeoutMs: 3000 },
      'authRpc',
    );
    try {
      const reply = await client.call(RPC_PATTERNS.authPing, {}, 'corr-rpc-1');
      expect(reply.service).toBe('auth');
      expect(rpcCalls.at(-1)?.correlationId).toBe('corr-rpc-1');

      const domain = await client
        .call(RPC_PATTERNS.authMe, { userId: crypto.randomUUID() }, 'c')
        .catch((e: unknown) => e);
      expect(domain).toBeInstanceOf(AppError);
      expect((domain as AppError).code).toBe('UNAUTHENTICATED');

      const invalid = await client
        .call(RPC_PATTERNS.authMe, { userId: 'not-a-uuid' }, 'c')
        .catch((e: AppError) => e);
      expect(invalid.code).toBe('VALIDATION_FAILED');
      expect(invalid.details?.[0]?.path).toBe('userId');

      // An unexpected failure does not leak its message.
      const crash = await client
        .call(RPC_PATTERNS.authUsersSummaries, { ids: [] }, 'c')
        .catch((e: AppError) => e);
      expect(crash.code).toBe('INTERNAL_ERROR');
      expect(crash.message).not.toContain('exploded');
    } finally {
      await client.close();
    }
  });

  it('times out with SERVICE_UNAVAILABLE, and the expired request is never handled', async () => {
    const before = rpcCalls.length;
    const client = createRpcClient(
      { url, topology, timeoutMs: 400 },
      'chatRpc',
    );
    try {
      await client.connect();
      const started = Date.now();
      const error = await client
        .call(RPC_PATTERNS.authPing, {}, 'c')
        .catch((e: AppError) => e);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(Date.now() - started).toBeLessThan(1500);

      // The service comes up after the caller gave up: nothing to handle.
      await wait(200);
      await startServer(
        AuthRpcController,
        rpcServerOptions(url, topology, 'chatRpc'),
      );
      await wait(800);
      expect(rpcCalls.length).toBe(before);
    } finally {
      await client.close();
    }
  });
});

// --- events ----------------------------------------------------------------------

const received = new Map<string, DomainEvent[]>();
const eventTracker = new InflightTracker();

function listenerFor(instance: string) {
  @Controller()
  class Listener {
    @EventPattern(DOMAIN_EVENTS.sessionRevoked)
    revoked(@Payload() data: unknown, @Ctx() context: RmqContext) {
      return consumeEvent(
        context,
        data,
        { tracker: eventTracker, logger },
        (event) => {
          received.set(instance, [...(received.get(instance) ?? []), event]);
        },
      );
    }
  }
  return Listener;
}

describe('events', () => {
  it('reach every subscriber with a queue of its own, once each', async () => {
    for (const instance of ['a', 'b']) {
      await startServer(
        listenerFor(instance),
        eventServerOptions(url, topology, {
          instanceQueue: `${prefix}gateway.events.${instance}`,
        }),
      );
    }
    const event = createDomainEvent(
      DOMAIN_EVENTS.sessionRevoked,
      { userId: crypto.randomUUID(), sid: crypto.randomUUID() },
      'corr-ev',
    );
    await new AmqpEventPublisher(connection, names).publish(event);

    await until(
      () =>
        (received.get('a')?.length ?? 0) > 0 &&
        (received.get('b')?.length ?? 0) > 0,
    );
    await wait(200);
    expect(received.get('a')).toEqual([event]);
    expect(received.get('b')).toEqual([event]);
  });

  it('fails fast instead of queueing in memory when RabbitMQ is unreachable', async () => {
    const offline = new MessagingConnection({
      url: 'amqp://guest:guest@127.0.0.1:1',
      name: 'offline-test',
      topology,
      publishTimeoutMs: 500,
    });
    offline.start(); // keeps retrying in the background, does not throw
    await wait(3500); // several failed attempts: the backoff is now seconds
    try {
      const publishing = Date.now();
      const error = await new AmqpEventPublisher(offline, names)
        .publish(
          createDomainEvent(
            DOMAIN_EVENTS.sessionRevoked,
            { userId: crypto.randomUUID(), sid: crypto.randomUUID() },
            'c',
          ),
        )
        .catch((e: AppError) => e);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(Date.now() - publishing).toBeLessThan(100);
      expect(offline.isConnected()).toBe(false);
    } finally {
      // Shutting down while waiting to reconnect must not wait for the backoff.
      const closing = Date.now();
      await offline.close();
      expect(Date.now() - closing).toBeLessThan(1000);
    }
  });
});

// --- commands --------------------------------------------------------------------

type Behaviour = 'ok' | 'transient' | 'permanent' | 'hang';
const commandState = {
  behaviour: 'ok' as Behaviour,
  handled: [] as string[],
  rejected: [] as string[],
  redelivered: [] as boolean[],
};
const commandTracker = new InflightTracker();

@Controller()
class CommandController {
  @EventPattern(COMMAND_PATTERNS.chatSend)
  send(@Payload() data: unknown, @Ctx() context: RmqContext) {
    commandState.redelivered.push(
      (context.getMessage() as { fields: { redelivered: boolean } }).fields
        .redelivered,
    );
    return consumeCommand<ChatSendCommand>(context, data, {
      schema: chatSendCommandSchema,
      queue: names.chatCommands,
      dlq: names.chatCommandsDlq,
      maxAttempts: 3,
      connection,
      tracker: commandTracker,
      logger,
      handle: async (command) => {
        commandState.handled.push(command.text);
        switch (commandState.behaviour) {
          case 'transient':
            throw new Error('database unavailable');
          case 'permanent':
            throw new PermanentCommandError('NOT_A_MEMBER', 'not a member');
          case 'hang':
            await new Promise(() => undefined);
        }
      },
      reject: async (_command, code) => {
        commandState.rejected.push(code);
      },
    });
  }
}

const command = (text: string): ChatSendCommand => ({
  userId: crypto.randomUUID(),
  conversationId: crypto.randomUUID(),
  clientMessageId: crypto.randomUUID(),
  text,
  requestedAt: new Date().toISOString(),
});

async function queueCounts() {
  const raw = await amqpConnect(url);
  const channel = await raw.createChannel();
  const counts = {
    commands: (await channel.checkQueue(names.chatCommands)).messageCount,
    retry: (await channel.checkQueue(names.chatCommandsRetry)).messageCount,
    dlq: (await channel.checkQueue(names.chatCommandsDlq)).messageCount,
  };
  await raw.close();
  return counts;
}

describe('commands', () => {
  beforeEach(() => {
    Object.assign(commandState, {
      behaviour: 'ok',
      handled: [],
      rejected: [],
      redelivered: [],
    });
  });

  it('retries a transient failure, then moves it to the DLQ after the last attempt and tells the sender', async () => {
    commandState.behaviour = 'transient';
    await startServer(CommandController, commandServerOptions(url, topology));
    await new CommandPublisher(connection, names).sendChat(
      command('t'),
      'corr-cmd',
    );

    await until(() => commandState.rejected.length > 0, 8000);
    expect(commandState.handled).toEqual(['t', 't', 't']);
    expect(commandState.rejected).toEqual(['SEND_FAILED']);
    await wait(700); // longer than the retry delay: no 4th attempt
    expect(commandState.handled).toHaveLength(3);
    expect(await queueCounts()).toEqual({ commands: 0, retry: 0, dlq: 1 });
  });

  it('rejects a permanent failure once, without retrying', async () => {
    commandState.behaviour = 'permanent';
    await startServer(CommandController, commandServerOptions(url, topology));
    await new CommandPublisher(connection, names).sendChat(command('p'), 'c');

    await until(() => commandState.rejected.length > 0);
    await wait(700);
    expect(commandState.handled).toEqual(['p']);
    expect(commandState.rejected).toEqual(['NOT_A_MEMBER']);
    expect((await queueCounts()).retry).toBe(0);
  });

  it('acks only after handling: a consumer that dies mid-way gets the message redelivered', async () => {
    commandState.behaviour = 'hang';
    const dying = await startServer(
      CommandController,
      commandServerOptions(url, topology),
    );
    await new CommandPublisher(connection, names).sendChat(command('k'), 'c');
    await until(() => commandState.handled.length === 1);

    // The process goes away without acking (its connection closes).
    apps.splice(apps.indexOf(dying), 1);
    await dying.close();

    commandState.behaviour = 'ok';
    await startServer(CommandController, commandServerOptions(url, topology));
    await until(() => commandState.handled.length === 2);
    expect(commandState.redelivered).toEqual([false, true]);
    await wait(300);
    expect(await queueCounts()).toMatchObject({ commands: 0, retry: 0 });
  });
});
