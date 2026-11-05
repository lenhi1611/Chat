import {
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';
import { chatEffects } from './chat.effects';
import { chatFeature } from './chat.feature';
import { connectionFeature } from './connection.feature';

/**
 * Registers the chat state (connection + messages) and its effects.
 *
 * Call it ONCE, at the root of the application that owns the connection: the
 * shell (or mfe-chat when it runs standalone). Requires `provideStore()` and
 * `provideChatSocket({ url })` in the same application. Remotes loaded by the
 * shell must not call it again: they share the shell's Store.
 */
export function provideChatData(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideState(connectionFeature),
    provideState(chatFeature),
    provideEffects(chatEffects),
  ]);
}
