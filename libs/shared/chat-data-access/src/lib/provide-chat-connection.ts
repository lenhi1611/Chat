import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { ChatActions } from './chat.actions';
import { provideChatData } from './provide-chat-data';
import { provideChatSocket } from '@realtime-chat/socket';

/**
 * The one chat connection of the whole app, for the app that owns it: the
 * shell, or a remote running standalone (its own app.config.ts only).
 *
 * Registers the WebSocket endpoint, the chat state/effects at the root
 * injector, and dispatches `connect` once at startup. Remotes loaded by the
 * shell reuse all of it through the shared Store: they never call this and
 * never inject the socket (lint: socket is `access:shell-only`). Lives here,
 * not in the shell, so a standalone remote can wire the connection without
 * importing the socket lib. Requires `provideStore()`.
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
