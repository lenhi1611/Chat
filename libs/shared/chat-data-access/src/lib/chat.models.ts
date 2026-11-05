import type {
  ChatMessagePayload,
  SystemErrorCode,
} from '@realtime-chat/contracts';
import type { ChatSocketState } from '@realtime-chat/socket';

/** A chat message as broadcast by the server (id and sentAt are server-assigned). */
export type ChatMessage = ChatMessagePayload;

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
