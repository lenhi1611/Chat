import { z } from 'zod';
import { conversationDtoSchema, messageDtoSchema } from '../http/conversations';
import { SYSTEM_ERROR_CODES } from '../ws/ws.schemas';
import { DOMAIN_EVENTS, type DomainEventType } from './messaging.constants';

// --- payloads ------------------------------------------------------------------

const recipientUserIds = z.array(z.uuid()).min(1);

export const DOMAIN_EVENT_PAYLOADS = {
  [DOMAIN_EVENTS.userRegistered]: z.object({
    userId: z.uuid(),
    username: z.string().min(1),
    displayName: z.string().min(1),
  }),
  [DOMAIN_EVENTS.sessionRevoked]: z.object({
    userId: z.uuid(),
    sid: z.uuid(),
  }),
  [DOMAIN_EVENTS.messageCreated]: z.object({
    message: messageDtoSchema,
    /** Every member: the gateway pushes to their sockets. */
    recipientUserIds,
  }),
  [DOMAIN_EVENTS.messageRejected]: z.object({
    /** The sender, who gets the `system.error`. */
    userId: z.uuid(),
    conversationId: z.uuid(),
    clientMessageId: z.uuid(),
    code: z.enum(SYSTEM_ERROR_CODES),
    message: z.string(),
  }),
  [DOMAIN_EVENTS.conversationCreated]: z.object({
    conversation: conversationDtoSchema,
    recipientUserIds,
  }),
} as const satisfies Record<DomainEventType, z.ZodType>;

export type DomainEventPayload<T extends DomainEventType> = z.infer<
  (typeof DOMAIN_EVENT_PAYLOADS)[T]
>;

// --- envelope ------------------------------------------------------------------

const envelopeBase = {
  /** Unique per event: consumers may use it to drop duplicates. */
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  /** Of the request that caused the event (HTTP request, chat.send frame). */
  correlationId: z.string().min(1).max(128),
};

const envelopeOf = <T extends DomainEventType>(type: T) =>
  z.object({
    ...envelopeBase,
    type: z.literal(type),
    payload: DOMAIN_EVENT_PAYLOADS[type],
  });

/** Every event on `rtc.events`: `{ id, type, occurredAt, correlationId, payload }`. */
export const domainEventSchema = z.discriminatedUnion('type', [
  envelopeOf(DOMAIN_EVENTS.userRegistered),
  envelopeOf(DOMAIN_EVENTS.sessionRevoked),
  envelopeOf(DOMAIN_EVENTS.messageCreated),
  envelopeOf(DOMAIN_EVENTS.messageRejected),
  envelopeOf(DOMAIN_EVENTS.conversationCreated),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventOf<T extends DomainEventType> = Extract<
  DomainEvent,
  { type: T }
>;

/** Builds an event with a fresh id and the current time. */
export function createDomainEvent<T extends DomainEventType>(
  type: T,
  payload: DomainEventPayload<T>,
  correlationId: string,
): DomainEventOf<T> {
  return {
    id: crypto.randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
    correlationId,
    payload,
  } as DomainEventOf<T>;
}

export type ParseDomainEventResult =
  { ok: true; event: DomainEvent } | { ok: false; error: string };

/**
 * Validates an event received from the broker (text or already parsed).
 * Never throws: a consumer drops (and logs) what does not parse instead of
 * crashing on it.
 */
export function parseDomainEvent(raw: unknown): ParseDomainEventResult {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'not valid JSON' };
    }
  }
  const result = domainEventSchema.safeParse(value);
  return result.success
    ? { ok: true, event: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}
