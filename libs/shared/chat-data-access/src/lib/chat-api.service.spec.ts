import { HttpErrorResponse } from '@angular/common/http';
import {
  SERVICE_UNAVAILABLE_MESSAGE,
  toRequestError,
} from './chat-api.service';

describe('toRequestError', () => {
  it('replaces SERVICE_UNAVAILABLE with a friendly message', () => {
    const error = new HttpErrorResponse({
      status: 503,
      error: {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The chat service did not answer in time',
        },
      },
    });
    expect(toRequestError(error)).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
  });

  it('keeps other API errors, and maps no answer at all to NETWORK_ERROR', () => {
    expect(
      toRequestError(
        new HttpErrorResponse({
          status: 404,
          error: {
            error: { code: 'NOT_FOUND', message: 'Conversation not found' },
          },
        }),
      ),
    ).toEqual({ code: 'NOT_FOUND', message: 'Conversation not found' });
    expect(toRequestError(new HttpErrorResponse({ status: 0 })).code).toBe(
      'NETWORK_ERROR',
    );
  });
});
