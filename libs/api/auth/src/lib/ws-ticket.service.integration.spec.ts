import { Redis } from 'ioredis';
import { testRedisUrl } from '../../../../../tools/db/env.mjs';
import type { AuthModuleOptions } from './auth.options';
import { WsTicketService } from './ws-ticket.service';

describe('WsTicketService (integration, Redis)', () => {
  let redis: Redis;
  let tickets: WsTicketService;
  const owner = { userId: crypto.randomUUID(), sid: crypto.randomUUID() };

  beforeAll(() => {
    redis = new Redis(testRedisUrl());
    tickets = new WsTicketService(redis, {
      wsTicketTtlSeconds: 30,
    } as AuthModuleOptions);
  });
  afterAll(() => redis.quit());

  it('issues an opaque ticket that expires after the configured TTL', async () => {
    const { ticket, expiresIn } = await tickets.issue(owner);
    expect(expiresIn).toBe(30);
    expect(Buffer.from(ticket, 'base64url')).toHaveLength(32);
    const ttl = await redis.ttl(`ws-ticket:${ticket}`);
    expect(ttl).toBeGreaterThan(28);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it('can be consumed exactly once', async () => {
    const { ticket } = await tickets.issue(owner);
    await expect(tickets.consume(ticket)).resolves.toEqual(owner);
    await expect(tickets.consume(ticket)).resolves.toBeNull();
  });

  it('is single-use even when consumed concurrently', async () => {
    const { ticket } = await tickets.issue(owner);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => tickets.consume(ticket)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('is gone once expired', async () => {
    const { ticket } = await tickets.issue(owner);
    await redis.pexpire(`ws-ticket:${ticket}`, 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(tickets.consume(ticket)).resolves.toBeNull();
  });

  it('rejects unknown tickets', async () => {
    await expect(tickets.consume('nope')).resolves.toBeNull();
  });
});
