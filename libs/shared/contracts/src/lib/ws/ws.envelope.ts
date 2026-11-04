import { z } from 'zod';
import {
  clientEventSchemas,
  serverEventSchemas,
  WS_EVENTS,
  type ClientEnvelope,
  type ClientEventMap,
  type ServerEnvelope,
  type ServerEventMap,
  type SystemErrorPayload,
} from './ws.schemas';

type AllEventMap = ClientEventMap & ServerEventMap;

/** Who sent the frame being parsed; decides which events are accepted. */
export type EnvelopeSender = 'client' | 'server';

export type ParseEnvelopeResult<T> =
  { ok: true; envelope: T } | { ok: false; error: SystemErrorPayload };

const envelopeShape = z.object({
  event: z.string().min(1),
  data: z.unknown(),
});

/** Builds a typed `{ event, data }` frame. Serialize it with `JSON.stringify`. */
export function createEnvelope<E extends keyof AllEventMap>(
  event: E,
  data: AllEventMap[E],
): { event: E; data: AllEventMap[E] } {
  return { event, data };
}

/**
 * Parses and validates a raw frame.
 *
 * `raw` is the frame text (JSON) or an already-parsed value. `from` selects the
 * accepted events: the server parses frames sent by clients, the browser parses
 * frames sent by the server. Never throws: failures come back as a
 * `system.error` payload ready to be sent to the offending client.
 */
export function parseEnvelope(
  raw: unknown,
  from: 'client',
): ParseEnvelopeResult<ClientEnvelope>;
export function parseEnvelope(
  raw: unknown,
  from: 'server',
): ParseEnvelopeResult<ServerEnvelope>;
export function parseEnvelope(
  raw: unknown,
  from: EnvelopeSender,
): ParseEnvelopeResult<ClientEnvelope | ServerEnvelope> {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return failure('INVALID_PAYLOAD', 'Frame is not valid JSON.');
    }
  }

  const shape = envelopeShape.safeParse(value);
  if (!shape.success) {
    return failure(
      'INVALID_PAYLOAD',
      'Frame must be an object { event: string, data: object }.',
    );
  }

  const { event, data } = shape.data;
  const schemas: Record<string, z.ZodType> =
    from === 'client' ? clientEventSchemas : serverEventSchemas;
  const schema = Object.hasOwn(schemas, event) ? schemas[event] : undefined;
  if (!schema) {
    return failure('UNKNOWN_EVENT', `Unknown event "${event}".`);
  }

  const payload = schema.safeParse(data);
  if (!payload.success) {
    if (event === WS_EVENTS.chatSend && isTextTooLong(payload.error)) {
      return failure('MESSAGE_TOO_LONG', 'Message text is too long.');
    }
    return failure(
      'INVALID_PAYLOAD',
      `Invalid "${event}" payload: ${z.prettifyError(payload.error)}`,
    );
  }

  return {
    ok: true,
    envelope: { event, data: payload.data } as ClientEnvelope | ServerEnvelope,
  };
}

function isTextTooLong(error: z.ZodError): boolean {
  return error.issues.some(
    (issue) => issue.code === 'too_big' && issue.path[0] === 'text',
  );
}

function failure(
  code: SystemErrorPayload['code'],
  message: string,
): { ok: false; error: SystemErrorPayload } {
  return { ok: false, error: { code, message } };
}
