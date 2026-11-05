import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import {
  API_ERROR_STATUS,
  type ApiError,
  type ApiErrorCode,
  AppError,
} from '@realtime-chat/contracts';
import type { Response } from 'express';

/** Code for errors Nest raises itself (unknown route, malformed JSON…). */
function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'VALIDATION_FAILED';
}

/**
 * Every REST error leaves as `{ error: { code, message, details? } }`.
 * Registered globally (APP_FILTER), which in Nest covers HTTP only: WebSocket
 * gateways do not use global filters (verified in @nestjs/websockets).
 * Unexpected errors are logged with their stack; the client only gets
 * INTERNAL_ERROR, never internal messages.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toResponse(exception);
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): [number, ApiError] {
    if (exception instanceof AppError) {
      return [
        API_ERROR_STATUS[exception.code],
        {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details && { details: exception.details }),
          },
        },
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = codeForStatus(status);
      if (status >= 500) this.logger.error(exception.message, exception.stack);
      return [
        status,
        {
          error: {
            code,
            message:
              status >= 500 ? 'Internal server error' : exception.message,
          },
        },
      ];
    }
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return [
      500,
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    ];
  }
}
