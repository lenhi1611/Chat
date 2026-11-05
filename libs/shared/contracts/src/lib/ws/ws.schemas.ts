import { z } from 'zod';
import { MAX_TEXT_LENGTH } from './ws.constants';

/** Event names. Every frame is a JSON envelope `{ event, data }`. */
export const WS_EVENTS = {
  /** Client → server */
  chatSend: 'chat.send',
  /** Server → client, sent right after the connection is accepted */
  sessionWelcome: 'session.welcome',
  /** Server → every client (sender included) */
  chatMessage: 'chat.message',
  /** Server → the client whose frame was rejected */
  systemError: 'system.error',
} as const;

export const SYSTEM_ERROR_CODES = [
  'INVALID_PAYLOAD',
  'MESSAGE_TOO_LONG',
  'UNKNOWN_EVENT',
] as const;

// --- payloads ----------------------------------------------------------------

const messageText = z.string().trim().min(1).max(MAX_TEXT_LENGTH);

export const chatSendPayloadSchema = z.object({
  clientMessageId: z.uuid(),
  text: messageText,
});

export const sessionWelcomePayloadSchema = z.object({
  clientId: z.uuid(),
  nickname: z.string().min(1),
});

export const chatMessagePayloadSchema = z.object({
  id: z.uuid(),
  clientMessageId: z.uuid(),
  senderId: z.uuid(),
  senderNickname: z.string().min(1),
  text: messageText,
  sentAt: z.iso.datetime(),
});

export const systemErrorPayloadSchema = z.object({
  code: z.enum(SYSTEM_ERROR_CODES),
  message: z.string(),
});

export type ChatSendPayload = z.infer<typeof chatSendPayloadSchema>;
export type SessionWelcomePayload = z.infer<typeof sessionWelcomePayloadSchema>;
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
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
