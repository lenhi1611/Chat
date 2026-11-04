import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  type ClientEvent,
  type ClientEventMap,
  createEnvelope,
  parseEnvelope,
  type ServerEnvelope,
  WS_CLIENT_ID_PARAM,
} from '@realtime-chat/contracts';
import {
  BehaviorSubject,
  defer,
  Observable,
  Subject,
  type Subscription,
  retry,
  timer,
} from 'rxjs';
import {
  CHAT_SOCKET_CONFIG,
  CLIENT_ID_STORAGE,
  DEFAULT_RECONNECT_OPTIONS,
  WEB_SOCKET_FACTORY,
  type WebSocketLike,
} from './chat-socket.config';
import { loadOrCreateClientId } from './client-id';
import { reconnectDelay } from './reconnect-delay';

/**
 * - `idle`: never connected
 * - `connecting`: first attempt in progress
 * - `open`: connected, `send()` allowed
 * - `reconnecting`: connection lost unexpectedly, retrying with backoff
 * - `closed`: closed on purpose with `disconnect()`, no retry
 */
export type ChatSocketState =
  'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export class SocketNotOpenError extends Error {
  constructor(readonly state: ChatSocketState) {
    super(`Cannot send: the chat socket is "${state}", not "open".`);
    this.name = 'SocketNotOpenError';
  }
}

/** The socket closed without `disconnect()` being called; triggers a retry. */
class SocketClosedError extends Error {
  constructor(readonly code: number) {
    super(`WebSocket closed unexpectedly (code ${code})`);
  }
}

type SocketSignal = { type: 'open' } | { type: 'message'; data: unknown };

// WebSocket.readyState values (the global may not exist outside browsers).
const CONNECTING = 0;
const OPEN = 1;
const NORMAL_CLOSURE = 1000;

/**
 * The application's single WebSocket connection, on the browser's native
 * WebSocket API (no client library).
 *
 * Owned by the shell. Remotes must not inject it: a copy of this class bundled
 * into a remote would be a different DI token and open a second connection.
 * They talk to it through NgRx actions/effects (see chat-data-access).
 */
@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private readonly config = inject(CHAT_SOCKET_CONFIG, { optional: true });
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly reconnectOptions = {
    ...DEFAULT_RECONNECT_OPTIONS,
    ...this.config?.reconnect,
  };

  /** Anonymous identity, persisted in localStorage; sent on every connect. */
  readonly clientId = loadOrCreateClientId(inject(CLIENT_ID_STORAGE));

  private readonly stateSignal = signal<ChatSocketState>('idle');
  private readonly stateSubject = new BehaviorSubject<ChatSocketState>('idle');
  /** Current state, for templates and computed(). */
  readonly state = this.stateSignal.asReadonly();
  /**
   * Same state as a stream, for RxJS consumers. Every transition is emitted
   * synchronously (no signal-style coalescing), so effects never miss one.
   */
  readonly state$ = this.stateSubject.asObservable();

  private readonly eventsSubject = new Subject<ServerEnvelope>();
  /** Validated frames from the server. Invalid frames are dropped with a warning. */
  readonly events$ = this.eventsSubject.asObservable();

  private socket: WebSocketLike | null = null;
  private session: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.session?.unsubscribe();
      this.session = null;
      this.stateSubject.complete();
      this.eventsSubject.complete();
    });
  }

  /** Opens the connection. Does nothing while connecting, open or reconnecting. */
  connect(): void {
    if (this.session) return;
    if (!this.config) {
      throw new Error(
        'ChatSocketService: no endpoint configured. Add provideChatSocket({ url }) to the application providers.',
      );
    }
    this.setState('connecting');
    this.session = this.connection$().subscribe((signal) =>
      this.handleSignal(signal),
    );
  }

  /** Closes the connection on purpose; no reconnection follows. */
  disconnect(): void {
    if (!this.session) return;
    // Unsubscribing tears the socket down (see openSocket) and cancels any
    // pending retry timer, so no reconnect can be scheduled after this.
    this.session.unsubscribe();
    this.session = null;
    this.setState('closed');
  }

  /** Sends a typed client event. Throws SocketNotOpenError unless `open`. */
  send<E extends ClientEvent>(event: E, data: ClientEventMap[E]): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) {
      throw new SocketNotOpenError(this.stateSignal());
    }
    socket.send(JSON.stringify(createEnvelope(event, data)));
  }

  /**
   * One socket per subscription; an unexpected close errors the stream and
   * `retry` opens a new socket after the backoff delay. `resetOnSuccess`
   * restarts the attempt count once a socket has opened (its first emission).
   */
  private connection$(): Observable<SocketSignal> {
    return defer(() => this.openSocket()).pipe(
      retry({
        resetOnSuccess: true,
        delay: (_error, attempt) => {
          this.setState('reconnecting');
          return timer(reconnectDelay(attempt, this.reconnectOptions));
        },
      }),
    );
  }

  private openSocket(): Observable<SocketSignal> {
    return new Observable<SocketSignal>((subscriber) => {
      const socket = this.createSocket(this.buildUrl());

      socket.onopen = () => {
        this.socket = socket;
        this.setState('open');
        subscriber.next({ type: 'open' });
      };
      socket.onmessage = (event: MessageEvent) =>
        subscriber.next({ type: 'message', data: event.data });
      socket.onclose = (event: CloseEvent) => {
        this.socket = null;
        subscriber.error(new SocketClosedError(event.code));
      };
      // 'error' is always followed by 'close', which drives the retry.
      socket.onerror = null;

      return () => {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        if (this.socket === socket) this.socket = null;
        if (socket.readyState === CONNECTING || socket.readyState === OPEN) {
          socket.close(NORMAL_CLOSURE, 'Client disconnect');
        }
      };
    });
  }

  private handleSignal(signal: SocketSignal): void {
    if (signal.type !== 'message') return;
    if (typeof signal.data !== 'string') {
      console.warn('[ChatSocket] Ignoring a binary frame');
      return;
    }
    const result = parseEnvelope(signal.data, 'server');
    if (!result.ok) {
      console.warn(
        '[ChatSocket] Ignoring an invalid frame:',
        result.error.message,
      );
      return;
    }
    this.eventsSubject.next(result.envelope);
  }

  private buildUrl(): string {
    const url = new URL(this.config?.url ?? '');
    url.searchParams.set(WS_CLIENT_ID_PARAM, this.clientId);
    return url.toString();
  }

  private setState(state: ChatSocketState): void {
    if (this.stateSubject.value === state) return;
    this.stateSignal.set(state);
    this.stateSubject.next(state);
  }
}
