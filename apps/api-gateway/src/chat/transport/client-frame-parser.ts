import { parseEnvelope } from '@realtime-chat/contracts';

/**
 * Internal event produced by the parser for a frame that failed validation.
 * Clients cannot reach its handler with their own data: a client frame naming
 * this event is unknown to the protocol and is itself turned into an error.
 */
export const INVALID_FRAME_EVENT = 'internal.invalid-frame';

/** What `ws` hands to the adapter's message parser. */
export type WsFrameData = string | Buffer | ArrayBuffer | Buffer[];

/**
 * Message parser for Nest's WsAdapter.
 *
 * The default parser drops invalid JSON and unknown events silently. This one
 * validates every frame against the shared protocol and routes failures to
 * `INVALID_FRAME_EVENT` (handled by the gateway, which answers `system.error`),
 * so a bad frame never reaches a handler and never closes the connection.
 */
export function parseClientFrame(raw: WsFrameData): {
  event: string;
  data: unknown;
} {
  const result = parseEnvelope(toText(raw), 'client');
  return result.ok
    ? result.envelope
    : { event: INVALID_FRAME_EVENT, data: result.error };
}

function toText(raw: WsFrameData): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}
