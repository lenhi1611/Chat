import type { ListMessagesResponse } from '@realtime-chat/contracts';
import type { ChatMessage, ConversationHistory } from './chat.models';

export const emptyHistory = (): ConversationHistory => ({
  messages: [],
  loaded: false,
  nextBefore: null,
  status: 'idle',
  error: null,
});

/**
 * Union of two runs of one conversation, ascending by `seq`. `seq` is unique
 * per conversation, so a message delivered twice (live and in a page, or two
 * overlapping pages) is kept once.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return current as ChatMessage[];
  const last = current.at(-1);
  // Common case, a live message after the newest one: append.
  if (incoming.length === 1 && (!last || incoming[0].seq > last.seq)) {
    return [...current, incoming[0]];
  }
  const bySeq = new Map<number, ChatMessage>();
  for (const message of current) bySeq.set(message.seq, message);
  for (const message of incoming) bySeq.set(message.seq, message);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** A live message: appended (or ignored when already held). */
export function addLiveMessage(
  history: ConversationHistory,
  message: ChatMessage,
): ConversationHistory {
  return { ...history, messages: mergeMessages(history.messages, [message]) };
}

/**
 * The latest page, on first open or after a reconnect.
 *
 * - First load: whatever arrived live is merged in, older pages start at the
 *   page's `nextBefore`.
 * - Reload, the page overlaps or touches what is held: merged; the older
 *   pages already fetched stay valid.
 * - Reload with a gap (more messages were missed while offline than one page
 *   holds): what is held can no longer be kept contiguous, so it is dropped
 *   and paging restarts from this page.
 */
export function applyLatestPage(
  history: ConversationHistory,
  page: ListMessagesResponse,
): ConversationHistory {
  const settled = { ...history, loaded: true, status: 'idle' as const };
  const newestHeld = history.messages.at(-1)?.seq ?? 0;
  const oldestInPage = page.items[0]?.seq;
  if (!history.loaded) {
    return {
      ...settled,
      messages: mergeMessages(history.messages, page.items),
      nextBefore: page.nextBefore,
      error: null,
    };
  }
  if (oldestInPage !== undefined && oldestInPage > newestHeld + 1) {
    return {
      ...settled,
      messages: page.items,
      nextBefore: page.nextBefore,
      error: null,
    };
  }
  return {
    ...settled,
    messages: mergeMessages(history.messages, page.items),
    error: null,
  };
}

/**
 * An older page. Ignored if paging moved on meanwhile (the history was reset
 * by a gap): it would not be contiguous with what is held.
 */
export function applyOlderPage(
  history: ConversationHistory,
  before: number | null,
  page: ListMessagesResponse,
): ConversationHistory {
  if (history.nextBefore !== before) return { ...history, status: 'idle' };
  return {
    ...history,
    messages: mergeMessages(page.items, history.messages),
    nextBefore: page.nextBefore,
    status: 'idle',
    error: null,
  };
}
