import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  type ClientEvent,
  type ClientEventMap,
  createEnvelope,
  parseEnvelope,
  type ServerEnvelope,
  WS_CLOSE_CODES,
} from '@realtime-chat/contracts';
import {
  BehaviorSubject,
  defer,
  first,
  Observable,
  Subject,
  type Subscription,
  retry,
  switchMap,
  throwError,
  timer,
} from 'rxjs';
import {
  CHAT_SOCKET_CONFIG,
  CHAT_SOCKET_URL,
  DEFAULT_RECONNECT_OPTIONS,
  SocketRejectedError,
  WEB_SOCKET_FACTORY,
  type WebSocketLike,
} from './chat-socket.config';
import { reconnectDelay } from './reconnect-delay';

/**
 * - `idle`: never connected
 * - `connecting`: first attempt in progress
 * - `open`: connected, `send()` allowed
 * - `reconnecting`: connection lost unexpectedly, retrying with backoff
 * - `closed`: closed on purpose with `disconnect()`, or stopped for good
 *   (see `rejected$`); no retry
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

/**
 * Why the socket stopped by itself, for good:
 * - `session-ended`: the server closed it with 4401 (logout, revoked session)
 * - `unauthorized`: the URL provider refused (SocketRejectedError)
 */
export type SocketRejection = 'session-ended' | 'unauthorized';

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
  private readonly urlProvider = inject(CHAT_SOCKET_URL, { optional: true });
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly reconnectOptions = {
    ...DEFAULT_RECONNECT_OPTIONS,
    ...this.config?.reconnect,
  };

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

  private readonly rejectedSubject = new Subject<SocketRejection>();
  /**
   * The socket stopped without `disconnect()` and will not retry: the session
   * is over. Emitted after the state has become `closed`.
   */
  readonly rejected$ = this.rejectedSubject.asObservable();

  private socket: WebSocketLike | null = null;
  private session: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.session?.unsubscribe();
      this.session = null;
      this.stateSubject.complete();
      this.eventsSubject.complete();
      this.rejectedSubject.complete();
    });
  }

  /** Opens the connection. Does nothing while connecting, open or reconnecting. */
  connect(): void {
    if (this.session) return;
    const urlProvider = this.urlProvider;
    if (!urlProvider) {
      throw new Error(
        'ChatSocketService: no endpoint configured. Add provideChatSocket(...) to the application providers.',
      );
    }
    this.setState('connecting');
    this.session = this.connection$(urlProvider).subscribe({
      next: (signal) => this.handleSignal(signal),
      // Only non-retryable failures get here (see connection$).
      error: (error: unknown) => this.stop(error),
    });
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
   * One attempt per subscription: ask the provider for a fresh URL (a
   * ticket is single-use), then open one socket. A failed attempt or an
   * unexpected close errors the stream and `retry` starts a new attempt after
   * the backoff delay, unless the error says the session is over.
   * `resetOnSuccess` restarts the attempt count once a socket has opened.
   */
  private connection$(urlProvider: () => Observable<string>) {
    return defer(urlProvider).pipe(
      first(),
      switchMap((url) => this.openSocket(url)),
      retry({
        resetOnSuccess: true,
        delay: (error: unknown, attempt) => {
          if (rejectionOf(error)) return throwError(() => error);
          this.setState('reconnecting');
          return timer(reconnectDelay(attempt, this.reconnectOptions));
        },
      }),
    );
  }

  private openSocket(url: string): Observable<SocketSignal> {
    return new Observable<SocketSignal>((subscriber) => {
      const socket = this.createSocket(url);

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

  private stop(error: unknown): void {
    this.session = null;
    this.socket = null;
    this.setState('closed');
    const rejection = rejectionOf(error);
    if (rejection) {
      this.rejectedSubject.next(rejection);
    } else {
      // Not expected (a bug, or a provider error that escaped retry).
      console.error('[ChatSocket] Connection stopped:', error);
    }
  }

  private setState(state: ChatSocketState): void {
    if (this.stateSubject.value === state) return;
    this.stateSignal.set(state);
    this.stateSubject.next(state);
  }
}

function rejectionOf(error: unknown): SocketRejection | null {
  if (error instanceof SocketRejectedError) return 'unauthorized';
  if (
    error instanceof SocketClosedError &&
    error.code === WS_CLOSE_CODES.sessionEnded
  ) {
    return 'session-ended';
  }
  return null;
}
