import type { IncomingMessage } from 'node:http';
import type { Logger } from '@nestjs/common';
import { WS_TICKET_PARAM } from '@realtime-chat/contracts';
import type { VerifyClientCallbackAsync } from 'ws';

/** Who opened a socket: set during the upgrade, read by the gateway. */
export interface SocketOwner {
  userId: string;
  /** Login session (refresh-token family): logout closes its sockets. */
  sid: string;
}

/** Exchanges a ticket for its owner, once (null: unknown, expired or used). */
export type TicketConsumer = (ticket: string) => Promise<SocketOwner | null>;

const OWNER = Symbol('wsSocketOwner');
type RequestWithOwner = IncomingMessage & { [OWNER]?: SocketOwner };

/** The owner attached by the upgrade verifier, if any. */
export function getSocketOwner(
  request: IncomingMessage,
): SocketOwner | undefined {
  return (request as RequestWithOwner)[OWNER];
}

/** Reads `?ticket=` from an upgrade request URL. */
export function readTicket(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const ticket = new URL(url, 'http://localhost').searchParams.get(
      WS_TICKET_PARAM,
    );
    return ticket && ticket.length <= 128 ? ticket : null;
  } catch {
    return null;
  }
}

/**
 * `ws` hook run on every upgrade request, before the connection exists.
 *
 * 1. Origin: browsers do not apply CORS to WebSocket and would attach the
 *    user's cookies, so this is what stops cross-site WebSocket hijacking
 *    (403). Checked first, so a foreign page cannot even burn tickets.
 * 2. Ticket: single-use, short-lived, from `POST /api/auth/ws-ticket`
 *    (401 when missing, unknown, expired or already used). Its owner is
 *    attached to the request for the gateway.
 */
export function createUpgradeVerifier(
  allowedOrigins: readonly string[],
  consumeTicket: TicketConsumer,
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
    const ticket = readTicket(req.url);
    if (!ticket) {
      done(false, 401, 'Missing ticket');
      return;
    }
    consumeTicket(ticket).then(
      (owner) => {
        if (!owner) {
          logger.warn('Rejected WebSocket upgrade: invalid or used ticket');
          done(false, 401, 'Invalid ticket');
          return;
        }
        (req as RequestWithOwner)[OWNER] = owner;
        done(true);
      },
      (error: unknown) => {
        logger.error(
          `Ticket check failed: ${error instanceof Error ? error.message : error}`,
        );
        done(false, 503, 'Try again');
      },
    );
  };
}
