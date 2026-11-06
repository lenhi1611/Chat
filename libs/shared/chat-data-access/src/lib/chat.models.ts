import type {
  ApiErrorCode,
  ConversationDTO,
  MessageDTO,
  SystemErrorCode,
} from '@realtime-chat/contracts';
import type { ChatSocketState } from '@realtime-chat/socket';

/** A stored message (id, seq and sentAt are server-assigned). */
export type ChatMessage = MessageDTO;

export type Conversation = ConversationDTO;

export type ConnectionStatus = ChatSocketState;

/**
 * Last error shown to the user: a `system.error` from the server, or a local
 * one raised before anything was sent (`NOT_CONNECTED`, or a message the
 * client already knows the server would reject).
 */
export interface ChatError {
  code: SystemErrorCode | 'NOT_CONNECTED';
  message: string;
  /** ISO-8601; distinguishes two identical errors in a row. */
  at: string;
}

/** A failed REST call (list, create, history page). */
export interface RequestError {
  code: ApiErrorCode | 'NETWORK_ERROR';
  message: string;
}

export type RequestStatus = 'idle' | 'loading' | 'error';

/**
 * The part of one conversation's history held in memory: a contiguous run of
 * messages ending at the newest one known, ascending by `seq`.
 */
export interface ConversationHistory {
  messages: ChatMessage[];
  /**
   * `true` once the latest page has been fetched. Before that, `messages`
   * only holds what arrived live.
   */
  loaded: boolean;
  /** `before` of the next older page; `null` when the start is reached. */
  nextBefore: number | null;
  status: RequestStatus;
  error: RequestError | null;
}

/** What a history view needs besides the messages. */
export interface HistoryView {
  loaded: boolean;
  loading: boolean;
  hasOlder: boolean;
  error: RequestError | null;
}
