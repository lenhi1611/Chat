import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { ChatActions, provideChatData } from '@realtime-chat/chat-data-access';
import { provideChatSocket } from '@realtime-chat/socket';

/**
 * The shell owns the one chat connection of the whole app.
 *
 * Registers the WebSocket endpoint, the chat state/effects at the root
 * injector, and dispatches `connect` once at startup. Remotes loaded later
 * reuse all of it through the shared Store: they never call this, never call
 * `provideChatData()` and never inject the socket. Requires `provideStore()`.
 */
export function provideChatConnection(wsUrl: string): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideChatSocket({ url: wsUrl }),
    provideChatData(),
    // `connect` is idempotent, so a second dispatch (e.g. from a remote
    // running standalone code by mistake) does not open a second socket.
    provideAppInitializer(() => inject(Store).dispatch(ChatActions.connect())),
  ]);
}
