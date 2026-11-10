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
import { AppError, RPC_PATTERNS } from '@realtime-chat/contracts';
import { type Channel, type ChannelModel, connect } from 'amqplib';
import { WebSocket } from 'ws';
import { testRabbitUrl } from '../../../../tools/db/env.mjs';
import { AppModule } from '../app/app.module';
import { configureApp, connectGatewayEvents } from '../app/configure-app';

/*
 * Test harness for the WebSocket edge over RabbitMQ: the real gateway on a
 * random port, a fake auth-service consuming single-use tickets, and this
 * run's own exchange / queues (random prefix), deleted by stop().
 * Env (WS_MAX_AGE_SECONDS…) is read when AppModule is imported: set it
 * before importing this file.
 */

Logger.overrideLogger(false);

const ORIGIN = 'http://localhost:4200';
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

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(
  check: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await wait(20);
  }
}

export interface Client {
  socket: WebSocket;
  frames: { event: string; data: Record<string, unknown> }[];
  closeCode?: number;
}

export const framesOf = (client: Client, event: string) =>
  client.frames.filter((frame) => frame.event === event);

export interface GatewayHarness {
  gateway: INestApplication;
  topology: TopologySettings;
  channel: Channel;
  events: AmqpEventPublisher;
  tickets: Map<string, { userId: string; sid: string }>;
  ticketFor(userId: string, sid: string): string;
  /** Resolves after session.welcome, or with the HTTP refusal. */
  open(
    ticket: string | null,
    origin?: string,
  ): Promise<Client | { refused: number }>;
  openAs(userId: string, sid?: string): Promise<Client>;
  stop(): Promise<void>;
}

export async function startGateway(): Promise<GatewayHarness> {
  const url = testRabbitUrl();
  const topology: TopologySettings = {
    names: topologyNames(`test.${crypto.randomUUID().slice(0, 8)}.`),
    retryDelayMs: 300,
  };

  const fakeModule = await Test.createTestingModule({
    controllers: [FakeAuthController],
  }).compile();
  const fakeAuth = fakeModule.createNestApplication({ logger: false });
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
  const gateway = moduleRef.createNestApplication({ logger: false });
  configureApp(gateway);
  connectGatewayEvents(gateway, `test-${crypto.randomUUID().slice(0, 6)}`);
  await gateway.listen(0);
  await gateway.startAllMicroservices();
  await gateway.get(MessagingConnection).whenReady();
  const address = gateway.getHttpServer().address() as { port: number };
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  const amqp: ChannelModel = await connect(url);
  const channel = await amqp.createChannel();
  const events = new AmqpEventPublisher(
    gateway.get(MessagingConnection),
    topology.names,
  );

  const ticketFor = (userId: string, sid: string) => {
    const ticket = crypto.randomUUID();
    tickets.set(ticket, { userId, sid });
    return ticket;
  };

  const open = (ticket: string | null, origin = ORIGIN) =>
    new Promise<Client | { refused: number }>((resolve) => {
      const socket = new WebSocket(
        ticket === null
          ? wsUrl
          : `${wsUrl}?ticket=${encodeURIComponent(ticket)}`,
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

  const openAs = async (userId: string, sid = crypto.randomUUID()) => {
    const result = await open(ticketFor(userId, sid));
    if ('refused' in result) throw new Error(`refused ${result.refused}`);
    return result;
  };

  const stop = async () => {
    await gateway.close();
    await fakeAuth.close();
    for (const [key, name] of Object.entries(topology.names)) {
      if (key === 'exchange') await channel.deleteExchange(name);
      else await channel.deleteQueue(name);
    }
    await amqp.close();
  };

  return {
    gateway,
    topology,
    channel,
    events,
    tickets,
    ticketFor,
    open,
    openAs,
    stop,
  };
}
