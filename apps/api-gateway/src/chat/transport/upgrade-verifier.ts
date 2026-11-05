import type { Logger } from '@nestjs/common';
import { WS_CLIENT_ID_PARAM } from '@realtime-chat/contracts';
import type { VerifyClientCallbackAsync } from 'ws';
import { z } from 'zod';

const clientIdSchema = z.uuid();

/** Reads and validates `?clientId=<uuid>` from an upgrade request URL. */
export function readClientId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const clientId = new URL(url, 'http://localhost').searchParams.get(
      WS_CLIENT_ID_PARAM,
    );
    return clientId && clientIdSchema.safeParse(clientId).success
      ? clientId
      : null;
  } catch {
    return null;
  }
}

/**
 * `ws` hook run on every upgrade request, before the connection exists.
 *
 * Browsers do not apply CORS to WebSocket: any page can open a socket to this
 * server and the browser attaches the user's cookies. Checking `Origin` here is
 * what stops cross-site WebSocket hijacking. Non-browser clients can forge the
 * header, so this is not authentication (that comes in phase 2).
 */
export function createUpgradeVerifier(
  allowedOrigins: readonly string[],
  logger: Logger,
): VerifyClientCallbackAsync {
  const allowed = new Set(allowedOrigins);

  return ({ origin, req }, done) => {
    if (!origin || !allowed.has(origin)) {
      logger.warn(
        `Rejected WebSocket upgrade: origin "${origin ?? '(none)'}" is not allowed`,
      );
      done(false, 403, 'Origin not allowed');
      return;
    }
    if (!readClientId(req.url)) {
      logger.warn('Rejected WebSocket upgrade: missing or invalid clientId');
      done(false, 400, 'Invalid clientId');
      return;
    }
    done(true);
  };
}
