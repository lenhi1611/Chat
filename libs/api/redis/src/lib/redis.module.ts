import {
  type DynamicModule,
  Inject,
  Injectable,
  type InjectionToken,
  Logger,
  Module,
  type ModuleMetadata,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';

/** Inject with `@Inject(REDIS_CLIENT) redis: Redis`. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export interface RedisModuleOptions {
  /** e.g. `redis://localhost:6379/0` */
  url: string;
  /** Shown by `CLIENT LIST`, handy when debugging. */
  connectionName?: string;
}

export interface RedisModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  inject?: InjectionToken[];
  useFactory: (
    ...args: never[]
  ) => RedisModuleOptions | Promise<RedisModuleOptions>;
}

/** Closes the connection once the app has shut every other module down. */
@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return;
    // quit() resolves on the server's OK, before the socket is closed: wait
    // for 'end' so the process does not exit with the connection still open.
    const ended = new Promise<void>((resolve) =>
      this.redis.once('end', () => resolve()),
    );
    // QUIT fails when there is no connection yet; then just drop the socket.
    await this.redis.quit().catch(() => this.redis.disconnect());
    await ended;
  }
}

/**
 * One shared ioredis connection for the whole app (global module: register it
 * once, at the root). Commands issued before the connection is ready are
 * queued by ioredis; connection errors are logged and retried, not thrown.
 */
@Module({})
export class RedisModule {
  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
    return {
      module: RedisModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: REDIS_CLIENT,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) => {
            const { url, connectionName } = await options.useFactory(...args);
            const logger = new Logger('Redis');
            const redis = new Redis(url, { connectionName });
            redis.on('error', (error: Error) =>
              logger.warn(`Connection error: ${error.message}`),
            );
            return redis;
          },
        },
        RedisShutdown,
      ],
      exports: [REDIS_CLIENT],
    };
  }
}
