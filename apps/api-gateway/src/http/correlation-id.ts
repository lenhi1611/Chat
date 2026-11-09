import {
  createParamDecorator,
  type ExecutionContext,
  Logger,
} from '@nestjs/common';
import { MESSAGING_HEADERS } from '@realtime-chat/contracts';
import type { NextFunction, Request, Response } from 'express';

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

const VALID = /^[\w.:-]{1,128}$/;
const logger = new Logger('HTTP');

/**
 * Gives every HTTP request a correlation id (the caller's
 * `x-correlation-id` if it looks sane, else a new one), echoes it in the
 * response, passes it on to RPCs, and logs the request with it when done.
 */
export function correlationIdMiddleware(
  request: CorrelatedRequest,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(MESSAGING_HEADERS.correlationId);
  const correlationId =
    incoming && VALID.test(incoming) ? incoming : crypto.randomUUID();
  request.correlationId = correlationId;
  response.setHeader(MESSAGING_HEADERS.correlationId, correlationId);
  const started = Date.now();
  response.on('finish', () => {
    logger.log(
      `${request.method} ${request.originalUrl.split('?')[0]} ${response.statusCode} in ${Date.now() - started}ms [correlationId=${correlationId}]`,
    );
  });
  next();
}

/** `@CorrelationId() correlationId: string` in a controller. */
export const CorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<CorrelatedRequest>().correlationId ??
    crypto.randomUUID(),
);
