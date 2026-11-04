import { DEFAULT_RECONNECT_OPTIONS } from './chat-socket.config';
import { reconnectDelay } from './reconnect-delay';

const opts = (random: number) => ({
  ...DEFAULT_RECONNECT_OPTIONS,
  random: () => random,
});

describe('reconnectDelay', () => {
  it('doubles from 500 ms and caps at 10 s (upper bound, random = 1)', () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 20].map((n) => reconnectDelay(n, opts(1))),
    ).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000, 10_000]);
  });

  it('never goes below half the ceiling (lower bound, random = 0)', () => {
    expect([1, 2, 6].map((n) => reconnectDelay(n, opts(0)))).toEqual([
      250, 500, 5000,
    ]);
  });
});
