import {
  type EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import type { Observable } from 'rxjs';

export interface ReconnectOptions {
  /** Delay before the first retry (ms). Doubles on each failed attempt. */
  initialDelayMs: number;
  /** Upper bound of the delay (ms). */
  maxDelayMs: number;
  /** Source of randomness for jitter, in [0, 1). Overridable in tests. */
  random: () => number;
}

export interface ChatSocketConfig {
  reconnect?: Partial<ReconnectOptions>;
}

export const DEFAULT_RECONNECT_OPTIONS: ReconnectOptions = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  random: Math.random,
};

export const CHAT_SOCKET_CONFIG = new InjectionToken<ChatSocketConfig>(
  'CHAT_SOCKET_CONFIG',
);

/**
 * Produces the URL of one connection attempt, e.g. `ws://…/ws?ticket=…`.
 * Called before every attempt (first connect and each reconnect), because a
 * ticket can only be used once. Its first value is used.
 *
 * Errors:
 * - {@link SocketRejectedError}: the user may not connect (no or dead
 *   session). The socket stops, does not retry, and emits `rejected$`.
 * - anything else (network, server down): retried with backoff.
 */
export type SocketUrlProvider = () => Observable<string>;

export const CHAT_SOCKET_URL = new InjectionToken<SocketUrlProvider>(
  'CHAT_SOCKET_URL',
);

/** Thrown by a {@link SocketUrlProvider} to stop connecting, without retry. */
export class SocketRejectedError extends Error {
  constructor(message = 'Not allowed to open the chat socket.') {
    super(message);
    this.name = 'SocketRejectedError';
  }
}

/** Minimal surface of the browser WebSocket used by ChatSocketService. */
export type WebSocketLike = Pick<
  WebSocket,
  | 'readyState'
  | 'send'
  | 'close'
  | 'onopen'
  | 'onmessage'
  | 'onclose'
  | 'onerror'
>;

/** Creates the socket. Replaced by a fake in unit tests. */
export const WEB_SOCKET_FACTORY = new InjectionToken<
  (url: string) => WebSocketLike
>('WEB_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url) => new WebSocket(url),
});

/**
 * Registers how to reach the server. Call once, in the app that owns the
 * connection. `urlProvider` runs in an injection context, so it may
 * `inject()` what it needs (HttpClient…) and return the provider function.
 */
export function provideChatSocket(
  urlProvider: () => SocketUrlProvider,
  config: ChatSocketConfig = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CHAT_SOCKET_URL, useFactory: urlProvider },
    { provide: CHAT_SOCKET_CONFIG, useValue: config },
  ]);
}
