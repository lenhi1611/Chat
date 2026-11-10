import { WS_CLOSE_CODES } from '@realtime-chat/contracts';
import type { GatewayHarness } from '../testing/gateway-harness';

/*
 * Socket lifetime: a socket is closed with 4000 once it reaches
 * WS_MAX_AGE_SECONDS, and the client gets back in with a fresh ticket. Its own
 * file: the short max age would cut the sockets of the other gateway tests.
 */

// Read by AppModule's env validation, so set before the harness imports it.
process.env['WS_MAX_AGE_SECONDS'] = '1';
const { startGateway, until } = await import('../testing/gateway-harness');
const { ConnectionRegistry } = await import('./connection-registry');

let h: GatewayHarness;
beforeAll(async () => {
  h = await startGateway();
});
afterAll(() => h.stop());

describe('socket max age', () => {
  it('closes a socket with 4000 after WS_MAX_AGE_SECONDS, and unregisters it', async () => {
    const opened = Date.now();
    const client = await h.openAs(crypto.randomUUID());
    await until(() => client.closeCode !== undefined, 3000);
    const lifetime = Date.now() - opened;
    expect(client.closeCode).toBe(WS_CLOSE_CODES.maxAgeReached);
    // Up to 10% earlier (jitter), never later than a little over 1 s.
    expect(lifetime).toBeGreaterThanOrEqual(850);
    expect(lifetime).toBeLessThan(1600);
    await until(() => h.gateway.get(ConnectionRegistry).size === 0);
  });

  it('lets the client back in with a fresh ticket (the old one is spent)', async () => {
    const userId = crypto.randomUUID();
    const sid = crypto.randomUUID();
    const ticket = h.ticketFor(userId, sid);
    const first = await h.open(ticket);
    if ('refused' in first) throw new Error('first connection refused');
    await until(() => first.closeCode === WS_CLOSE_CODES.maxAgeReached, 3000);

    expect(await h.open(ticket)).toEqual({ refused: 401 });
    const again = await h.openAs(userId, sid);
    expect(again.frames[0]).toEqual({
      event: 'session.welcome',
      data: { userId },
    });
    again.socket.close();
  });
});
