import {
  type EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';

export interface ReconnectOptions {
  /** Delay before the first retry (ms). Doubles on each failed attempt. */
  initialDelayMs: number;
  /** Upper bound of the delay (ms). */
  maxDelayMs: number;
  /** Source of randomness for jitter, in [0, 1). Overridable in tests. */
  random: () => number;
}

export interface ChatSocketConfig {
  /** WebSocket endpoint, e.g. `ws://localhost:3000/ws` (from the app environment). */
  url: string;
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

/** Storage for the anonymous clientId; `null` when unavailable. */
export const CLIENT_ID_STORAGE = new InjectionToken<Pick<
  Storage,
  'getItem' | 'setItem'
> | null>('CLIENT_ID_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      // Accessing localStorage throws when storage is blocked.
      return null;
    }
  },
});

/** Registers the WebSocket endpoint. Call once, in the app that owns the connection. */
export function provideChatSocket(
  config: ChatSocketConfig,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CHAT_SOCKET_CONFIG, useValue: config },
  ]);
}
