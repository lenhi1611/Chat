import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import type { Action } from '@ngrx/store';
import {
  chatSendPayloadSchema,
  MAX_TEXT_LENGTH,
  type ServerEnvelope,
  WS_EVENTS,
} from '@realtime-chat/contracts';
import { ChatSocketService, SocketNotOpenError } from '@realtime-chat/socket';
import {
  EMPTY,
  exhaustMap,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  takeUntil,
} from 'rxjs';
import { ChatActions } from './chat.actions';
import type { ChatError } from './chat.models';

/**
 * The only place that talks to ChatSocketService. Components (including the
 * remotes) dispatch actions and read selectors; they never touch the socket.
 */

/**
 * `connect` → open the socket, then turn its state and events into actions
 * through one long-lived stream, cancelled by `disconnect`.
 *
 * `exhaustMap` (rather than switchMap) ignores extra `connect` actions while the
 * stream is live: the connection stays single and nothing is re-subscribed or
 * dispatched twice.
 */
export const connect$ = createEffect(
  (actions$ = inject(Actions), socket = inject(ChatSocketService)) =>
    actions$.pipe(
      ofType(ChatActions.connect),
      exhaustMap(() => {
        socket.connect();
        return merge(
          socket.state$.pipe(
            map((status) => ChatActions.connectionStatusChanged({ status })),
          ),
          socket.events$.pipe(map(eventToAction)),
        ).pipe(takeUntil(actions$.pipe(ofType(ChatActions.disconnect))));
      }),
    ),
  { functional: true },
);

/**
 * `disconnect` → close the socket. The final `closed` status is dispatched here
 * because connect$ has already stopped listening to the socket state.
 */
export const disconnect$ = createEffect(
  (actions$ = inject(Actions), socket = inject(ChatSocketService)) =>
    actions$.pipe(
      ofType(ChatActions.disconnect),
      map(() => {
        socket.disconnect();
        return ChatActions.connectionStatusChanged({ status: socket.state() });
      }),
    ),
  { functional: true },
);

/**
 * `sendMessage` → `chat.send` with a fresh clientMessageId. Dispatches nothing
 * on success (the message appears when the server broadcasts it back); a local
 * error when the socket is not open or the text would be rejected anyway.
 * No retry/optimistic update in phase 1.
 */
export const send$ = createEffect(
  (actions$ = inject(Actions), socket = inject(ChatSocketService)) =>
    actions$.pipe(
      ofType(ChatActions.sendMessage),
      mergeMap(({ text }): Observable<Action> => {
        const payload = chatSendPayloadSchema.safeParse({
          clientMessageId: crypto.randomUUID(),
          text,
        });
        if (!payload.success) {
          return of(localError(invalidTextError(text)));
        }
        try {
          socket.send(WS_EVENTS.chatSend, payload.data);
          return EMPTY;
        } catch (error) {
          if (error instanceof SocketNotOpenError) {
            return of(
              localError({
                code: 'NOT_CONNECTED',
                message: 'Not connected to the chat server.',
              }),
            );
          }
          throw error;
        }
      }),
    ),
  { functional: true },
);

export const chatEffects = { connect$, disconnect$, send$ };

function eventToAction(envelope: ServerEnvelope): Action {
  switch (envelope.event) {
    case WS_EVENTS.sessionWelcome:
      return ChatActions.welcomeReceived(envelope.data);
    case WS_EVENTS.chatMessage:
      return ChatActions.messageReceived({ message: envelope.data });
    case WS_EVENTS.systemError:
      return ChatActions.serverErrorReceived({
        error: { ...envelope.data, at: new Date().toISOString() },
      });
  }
}

function invalidTextError(text: string): Omit<ChatError, 'at'> {
  return text.trim().length > MAX_TEXT_LENGTH
    ? { code: 'MESSAGE_TOO_LONG', message: 'Message text is too long.' }
    : { code: 'INVALID_PAYLOAD', message: 'Message text is empty.' };
}

function localError(error: Omit<ChatError, 'at'>): Action {
  return ChatActions.serverErrorReceived({
    error: { ...error, at: new Date().toISOString() },
  });
}
