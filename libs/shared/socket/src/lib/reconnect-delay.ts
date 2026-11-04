import type { ReconnectOptions } from './chat-socket.config';

/**
 * Exponential backoff with "equal jitter" for retry number `attempt` (1-based):
 * the ceiling doubles each time (500ms, 1s, 2s, … up to maxDelayMs) and the
 * actual delay is random in [ceiling / 2, ceiling]. The jitter keeps many
 * clients that lost the server at the same moment from reconnecting in lockstep.
 */
export function reconnectDelay(
  attempt: number,
  { initialDelayMs, maxDelayMs, random }: ReconnectOptions,
): number {
  const ceiling = Math.min(
    maxDelayMs,
    initialDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
