import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { WS_TICKET_PARAM } from '@realtime-chat/contracts';
import {
  provideChatSocket,
  SocketRejectedError,
  type SocketUrlProvider,
} from '@realtime-chat/socket';
import { catchError, map, throwError } from 'rxjs';
import { ChatApiService, isUnauthorized } from './chat-api.service';
import { provideChatData } from './provide-chat-data';

export interface ChatConnectionConfig {
  /** WebSocket endpoint, e.g. `ws://localhost:3000/ws`. */
  wsUrl: string;
  /** REST API, e.g. `http://localhost:3000/api` (same as provideAuth's). */
  apiBaseUrl: string;
}

/**
 * Every attempt asks for a fresh single-use ticket (through HttpClient, so the
 * auth interceptor adds the token and refreshes it when expired). A 401 means
 * there is no valid session: stop instead of retrying; other failures
 * (network, 503) are retried by the socket with backoff.
 */
function ticketUrlProvider(wsUrl: string): () => SocketUrlProvider {
  return () => {
    const api = inject(ChatApiService);
    return () =>
      api.wsTicket().pipe(
        map(({ ticket }) => {
          const url = new URL(wsUrl);
          url.searchParams.set(WS_TICKET_PARAM, ticket);
          return url.toString();
        }),
        catchError((error: unknown) =>
          throwError(() =>
            isUnauthorized(error) ? new SocketRejectedError() : error,
          ),
        ),
      );
  };
}

/**
 * The one chat connection of the whole app, for the app that owns it: the
 * shell, or a remote running standalone (its own app.config.ts only).
 *
 * Registers the socket, the chat state/effects and REST client at the root
 * injector. The socket connects when a session is established and closes when
 * it ends (see chat.effects.ts); nothing connects at startup. Remotes loaded
 * by the shell reuse all of it through the shared Store: they never call this
 * and never inject the socket (lint: socket is `access:shell-only`).
 *
 * Requires `provideStore()`, `provideAuth()` and
 * `provideHttpClient(withInterceptorsFromDi())`.
 */
export function provideChatConnection(
  config: ChatConnectionConfig,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideChatSocket(ticketUrlProvider(config.wsUrl)),
    provideChatData(config.apiBaseUrl),
  ]);
}
