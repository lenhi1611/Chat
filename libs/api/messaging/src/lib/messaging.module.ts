import {
  type BeforeApplicationShutdown,
  type DynamicModule,
  Inject,
  Injectable,
  type InjectionToken,
  Module,
  type ModuleMetadata,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { MESSAGING_DEFAULTS } from '@realtime-chat/contracts';
import { MessagingConnection } from './connection';
import { InflightTracker } from './consumers';
import { EVENT_PUBLISHER } from './event-publisher.port';
import { AmqpEventPublisher, CommandPublisher } from './publishers';
import { createRpcClient } from './rpc';
import {
  defaultTopology,
  type QueueKey,
  type TopologySettings,
} from './topology';

export interface MessagingModuleOptions {
  /** `RABBITMQ_URL` */
  url: string;
  /** Names this app's connection (management UI, logs), e.g. `api-gateway`. */
  connectionName: string;
  /** `RPC_TIMEOUT_MS`: RPC timeout and request expiration; publish confirm timeout. */
  rpcTimeoutMs?: number;
  topology?: TopologySettings;
  /** How long shutdown waits for running handlers. */
  shutdownGraceMs?: number;
}

export type ResolvedMessagingOptions = Required<MessagingModuleOptions>;

/** Inject with `@Inject(MESSAGING_OPTIONS) options: ResolvedMessagingOptions`. */
export const MESSAGING_OPTIONS = Symbol('MESSAGING_OPTIONS');

export interface MessagingModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: InjectionToken[];
  useFactory: (
    ...args: never[]
  ) => MessagingModuleOptions | Promise<MessagingModuleOptions>;
}

/**
 * Shutdown, in Nest's order: `beforeApplicationShutdown` stops taking
 * messages and waits for running handlers (so they can ack), then Nest
 * closes the RMQ servers, then the publishing connection is closed.
 */
@Injectable()
class MessagingLifecycle
  implements BeforeApplicationShutdown, OnApplicationShutdown
{
  constructor(
    @Inject(MESSAGING_OPTIONS)
    private readonly options: ResolvedMessagingOptions,
    private readonly tracker: InflightTracker,
    private readonly connection: MessagingConnection,
  ) {}

  beforeApplicationShutdown(): Promise<void> {
    return this.tracker.drain(this.options.shutdownGraceMs);
  }

  onApplicationShutdown(): Promise<void> {
    return this.connection.close();
  }
}

/**
 * RabbitMQ for one app (global module: register once, at the root). Provides
 * the publishing connection (topology declared on every connect), the
 * EventPublisher port, the CommandPublisher and the in-flight tracker.
 * RMQ servers are added by the app with `connectMicroservice()` and the
 * option builders of this library.
 */
@Module({})
export class MessagingModule {
  static forRootAsync(options: MessagingModuleAsyncOptions): DynamicModule {
    return {
      module: MessagingModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: MESSAGING_OPTIONS,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) =>
            withDefaults(await options.useFactory(...args)),
        },
        {
          provide: MessagingConnection,
          inject: [MESSAGING_OPTIONS],
          useFactory: (o: ResolvedMessagingOptions) => {
            const connection = new MessagingConnection({
              url: o.url,
              name: o.connectionName,
              topology: o.topology,
              publishTimeoutMs: o.rpcTimeoutMs,
            });
            connection.start();
            return connection;
          },
        },
        {
          provide: EVENT_PUBLISHER,
          inject: [MessagingConnection, MESSAGING_OPTIONS],
          useFactory: (c: MessagingConnection, o: ResolvedMessagingOptions) =>
            new AmqpEventPublisher(c, o.topology.names),
        },
        {
          provide: CommandPublisher,
          inject: [MessagingConnection, MESSAGING_OPTIONS],
          useFactory: (c: MessagingConnection, o: ResolvedMessagingOptions) =>
            new CommandPublisher(c, o.topology.names),
        },
        InflightTracker,
        MessagingLifecycle,
      ],
      exports: [
        MESSAGING_OPTIONS,
        MessagingConnection,
        EVENT_PUBLISHER,
        CommandPublisher,
        InflightTracker,
      ],
    };
  }
}

export function withDefaults(
  options: MessagingModuleOptions,
): ResolvedMessagingOptions {
  return {
    rpcTimeoutMs: MESSAGING_DEFAULTS.rpcTimeoutMs,
    topology: defaultTopology(),
    shutdownGraceMs: 10_000,
    ...options,
  };
}

/** Provides an RpcClient for the service behind `queue` under `token`. */
export function rpcClientProvider(
  token: InjectionToken,
  queue: Extract<QueueKey, 'authRpc' | 'chatRpc'>,
): Provider {
  return {
    provide: token,
    inject: [MESSAGING_OPTIONS],
    useFactory: (o: ResolvedMessagingOptions) =>
      createRpcClient(
        { url: o.url, topology: o.topology, timeoutMs: o.rpcTimeoutMs },
        queue,
      ),
  };
}
