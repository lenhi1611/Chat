import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { testRedisUrl } from '../../../../../tools/db/env.mjs';
import { REDIS_CLIENT, RedisModule } from './redis.module';

@Injectable()
class UsesRedis {
  constructor(@Inject(REDIS_CLIENT) readonly redis: Redis) {}
}

describe('RedisModule (integration, needs `npm run infra:up`)', () => {
  const create = () =>
    Test.createTestingModule({
      imports: [
        RedisModule.forRootAsync({
          useFactory: () => ({ url: testRedisUrl(), connectionName: 'test' }),
        }),
      ],
      providers: [UsesRedis],
    }).compile();

  it('provides one shared client to any provider (global module)', async () => {
    const moduleRef = await create();
    const { redis } = moduleRef.get(UsesRedis);
    expect(redis).toBe(moduleRef.get(REDIS_CLIENT));
    await expect(redis.ping()).resolves.toBe('PONG');
    await moduleRef.close();
  });

  it('talks to the test database, not the dev one', async () => {
    const moduleRef = await create();
    const redis = moduleRef.get<Redis>(REDIS_CLIENT);
    expect(redis.options.db).toBe(15);
    const key = `test:${crypto.randomUUID()}`;
    await redis.set(key, 'v', 'EX', 5);
    await expect(redis.getdel(key)).resolves.toBe('v');
    await expect(redis.get(key)).resolves.toBeNull();
    await moduleRef.close();
  });

  it('closes the connection when the app shuts down', async () => {
    const moduleRef = await create();
    const redis = moduleRef.get<Redis>(REDIS_CLIENT);
    await redis.ping();
    await moduleRef.close();
    expect(redis.status).toBe('end');
  });
});
