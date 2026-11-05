import { z } from 'zod';
import { conversationDtoSchema, messageDtoSchema } from '../http/conversations';
import { MAX_TEXT_LENGTH } from './ws.constants';

/**
 * Event names (protocol v2, phase 2). Every frame is a JSON envelope
 * `{ event, data }`. Connect with `ws://…/ws?ticket=<single-use ticket>`.
 */
export const WS_EVENTS = {
  /** Client → server */
  chatSend: 'chat.send',
  /** Server → client, sent right after the connection is accepted */
  sessionWelcome: 'session.welcome',
  /** Server → every socket of every member (the sender included) */
  chatMessage: 'chat.message',
  /** Server → every socket of every member of a new conversation */
  conversationCreated: 'conversation.created',
  /** Server → the socket whose frame was rejected */
  systemError: 'system.error',
} as const;

export const SYSTEM_ERROR_CODES = [
  'INVALID_PAYLOAD',
  'MESSAGE_TOO_LONG',
  'UNKNOWN_EVENT',
  /** chat.send to a conversation the user is not a member of (or that does not exist). */
  'NOT_A_MEMBER',
  /** The message could not be stored; the client may retry (same clientMessageId). */
  'SEND_FAILED',
] as const;

// --- payloads ----------------------------------------------------------------

const messageText = z.string().trim().min(1).max(MAX_TEXT_LENGTH);

export const chatSendPayloadSchema = z.object({
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
  text: messageText,
});

export const sessionWelcomePayloadSchema = z.object({
  userId: z.uuid(),
});

/** A stored message: the REST MessageDTO, `seq` included. */
export const chatMessagePayloadSchema = messageDtoSchema;

export const conversationCreatedPayloadSchema = z.object({
  conversation: conversationDtoSchema,
});

export const systemErrorPayloadSchema = z.object({
  code: z.enum(SYSTEM_ERROR_CODES),
  message: z.string(),
  /** Echoed when the error is about a chat.send that carried one. */
  clientMessageId: z.uuid().optional(),
});

export type ChatSendPayload = z.infer<typeof chatSendPayloadSchema>;
export type SessionWelcomePayload = z.infer<typeof sessionWelcomePayloadSchema>;
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
export type ConversationCreatedPayload = z.infer<
  typeof conversationCreatedPayloadSchema
>;
export type SystemErrorPayload = z.infer<typeof systemErrorPayloadSchema>;
export type SystemErrorCode = SystemErrorPayload['code'];

// --- event maps (direction-specific) ----------------------------------------

/** Payload schema per event a client may send. */
export const clientEventSchemas = {
  [WS_EVENTS.chatSend]: chatSendPayloadSchema,
} as const;

/** Payload schema per event the server may send. */
export const serverEventSchemas = {
  [WS_EVENTS.sessionWelcome]: sessionWelcomePayloadSchema,
  [WS_EVENTS.chatMessage]: chatMessagePayloadSchema,
  [WS_EVENTS.conversationCreated]: conversationCreatedPayloadSchema,
  [WS_EVENTS.systemError]: systemErrorPayloadSchema,
} as const;

type PayloadMap<T extends Record<string, z.ZodType>> = {
  [E in keyof T]: z.infer<T[E]>;
};

export type ClientEventMap = PayloadMap<typeof clientEventSchemas>;
export type ServerEventMap = PayloadMap<typeof serverEventSchemas>;
export type ClientEvent = keyof ClientEventMap;
export type ServerEvent = keyof ServerEventMap;

/** A typed `{ event, data }` frame; a discriminated union over `event`. */
export type Envelope<M> = {
  [E in keyof M]: { event: E; data: M[E] };
}[keyof M];

export type ClientEnvelope = Envelope<ClientEventMap>;
export type ServerEnvelope = Envelope<ServerEventMap>;
