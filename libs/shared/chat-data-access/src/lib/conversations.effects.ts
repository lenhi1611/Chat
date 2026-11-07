import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { type Action, Store } from '@ngrx/store';
import {
  catchError,
  exhaustMap,
  filter,
  map,
  mergeMap,
  type Observable,
  of,
  switchMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs';
import {
  ChatActions,
  ConversationsActions,
  MessagesActions,
} from './chat.actions';
import { ChatApiService, toRequestError } from './chat-api.service';
import type { ConversationHistory } from './chat.models';
import { conversationsFeature } from './conversations.feature';
import { messagesFeature } from './messages.feature';

/** Ends with the session: a late response must not refill a reset state. */
const untilReset = <T>(actions$: Actions) =>
  takeUntil<T>(actions$.pipe(ofType(ChatActions.stateReset)));

const latestPage = (conversationId: string) =>
  MessagesActions.pageRequested({
    conversationId,
    mode: 'latest',
    before: null,
  });

/** Not fetched yet, and not being fetched. */
const needsFirstPage = (history: ConversationHistory | undefined) =>
  !history || (!history.loaded && history.status !== 'loading');

/**
 * `session.welcome` comes on every (re)connect: the moment to catch up on what
 * was missed while offline. Reloads the list and the latest page of every
 * history held (or open); the reducers merge them with what is in memory.
 */
export const syncOnWelcome$ = createEffect(
  (actions$ = inject(Actions), store = inject(Store)) =>
    actions$.pipe(
      ofType(ChatActions.welcomeReceived),
      withLatestFrom(
        store.select(messagesFeature.selectHistories),
        store.select(conversationsFeature.selectSelectedId),
      ),
      mergeMap(([, histories, selectedId]) => {
        const ids = new Set(
          Object.entries(histories)
            .filter(([, history]) => history.loaded)
            .map(([id]) => id),
        );
        if (selectedId) ids.add(selectedId);
        return [ConversationsActions.load(), ...[...ids].map(latestPage)];
      }),
    ),
  { functional: true },
);

export const loadConversations$ = createEffect(
  (actions$ = inject(Actions), api = inject(ChatApiService)) =>
    actions$.pipe(
      ofType(ConversationsActions.load),
      switchMap(() =>
        api.listConversations().pipe(
          map((conversations) =>
            ConversationsActions.loadSucceeded({ conversations }),
          ),
          catchError((error: unknown) =>
            of(
              ConversationsActions.loadFailed({ error: toRequestError(error) }),
            ),
          ),
          untilReset(actions$),
        ),
      ),
    ),
  { functional: true },
);

/**
 * A message for a conversation the list does not have (created while this
 * tab was offline, its push lost): reload the list.
 */
export const loadUnknownConversation$ = createEffect(
  (actions$ = inject(Actions), store = inject(Store)) =>
    actions$.pipe(
      ofType(ChatActions.messageReceived),
      withLatestFrom(
        store.select(conversationsFeature.selectConversationsState),
      ),
      filter(
        ([{ message }, state]) =>
          state.loaded &&
          state.status !== 'loading' &&
          !state.entities[message.conversationId],
      ),
      map(() => ConversationsActions.load()),
    ),
  { functional: true },
);

/** `exhaustMap`: a double submit creates one conversation. */
export const createConversation$ = createEffect(
  (actions$ = inject(Actions), api = inject(ChatApiService)) =>
    actions$.pipe(
      ofType(ConversationsActions.create),
      exhaustMap(({ request }) =>
        api.createConversation(request).pipe(
          map((conversation) =>
            ConversationsActions.createSucceeded({ conversation }),
          ),
          catchError((error: unknown) =>
            of(
              ConversationsActions.createFailed({
                error: toRequestError(error),
              }),
            ),
          ),
          untilReset(actions$),
        ),
      ),
    ),
  { functional: true },
);

/** Opening a conversation fetches its latest page, once. */
export const openConversation$ = createEffect(
  (actions$ = inject(Actions), store = inject(Store)) =>
    actions$.pipe(
      ofType(ConversationsActions.selected),
      withLatestFrom(store.select(messagesFeature.selectHistories)),
      mergeMap(([{ conversationId }, histories]): Action[] =>
        conversationId && needsFirstPage(histories[conversationId])
          ? [latestPage(conversationId)]
          : [],
      ),
    ),
  { functional: true },
);

/**
 * Scrolled to the top: the page before the oldest message held. Nothing while
 * a page of this conversation is loading or once its start is reached.
 */
export const loadOlder$ = createEffect(
  (actions$ = inject(Actions), store = inject(Store)) =>
    actions$.pipe(
      ofType(MessagesActions.olderRequested),
      withLatestFrom(store.select(messagesFeature.selectHistories)),
      mergeMap(([{ conversationId }, histories]): Action[] => {
        const history = histories[conversationId];
        if (needsFirstPage(history)) return [latestPage(conversationId)];
        if (
          !history ||
          history.status === 'loading' ||
          history.nextBefore === null
        ) {
          return [];
        }
        return [
          MessagesActions.pageRequested({
            conversationId,
            mode: 'older',
            before: history.nextBefore,
          }),
        ];
      }),
    ),
  { functional: true },
);

export const fetchPage$ = createEffect(
  (actions$ = inject(Actions), api = inject(ChatApiService)) =>
    actions$.pipe(
      ofType(MessagesActions.pageRequested),
      mergeMap(({ conversationId, mode, before }): Observable<Action> =>
        api.listMessages(conversationId, before).pipe(
          map((page) =>
            MessagesActions.pageLoaded({ conversationId, mode, before, page }),
          ),
          catchError((error: unknown) =>
            of(
              MessagesActions.pageFailed({
                conversationId,
                error: toRequestError(error),
              }),
            ),
          ),
          untilReset(actions$),
        ),
      ),
    ),
  { functional: true },
);

export const conversationsEffects = {
  syncOnWelcome$,
  loadConversations$,
  loadUnknownConversation$,
  createConversation$,
  openConversation$,
  loadOlder$,
  fetchPage$,
};
