import { HttpErrorResponse } from '@angular/common/http';
import { SERVICE_UNAVAILABLE_MESSAGE, toAuthError } from './http-errors';

const apiError = (status: number, code: string, message = 'from server') =>
  new HttpErrorResponse({ status, error: { error: { code, message } } });

describe('toAuthError', () => {
  it('replaces SERVICE_UNAVAILABLE with a friendly message', () => {
    expect(
      toAuthError(
        apiError(
          503,
          'SERVICE_UNAVAILABLE',
          'The auth service did not answer in time',
        ),
      ),
    ).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
  });

  it('treats a bare 503 (no API body, e.g. a proxy) the same way', () => {
    expect(
      toAuthError(
        new HttpErrorResponse({ status: 503, error: 'Service Unavailable' }),
      ).code,
    ).toBe('SERVICE_UNAVAILABLE');
  });

  it('keeps other API errors as the server sent them', () => {
    expect(
      toAuthError(
        apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
      ),
    ).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('reports an unreachable server as NETWORK_ERROR', () => {
    expect(toAuthError(new HttpErrorResponse({ status: 0 })).code).toBe(
      'NETWORK_ERROR',
    );
  });
});
