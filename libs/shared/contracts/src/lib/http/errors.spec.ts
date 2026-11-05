import { API_ERROR_CODES, API_ERROR_STATUS, isApiError } from './errors';

describe('ApiError', () => {
  it('maps every code to an HTTP error status', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(API_ERROR_STATUS.INVALID_CREDENTIALS).toBe(401);
    expect(API_ERROR_STATUS.NOT_FOUND).toBe(404);
    expect(API_ERROR_STATUS.EMAIL_TAKEN).toBe(409);
  });

  it('recognises the error envelope, with or without details', () => {
    expect(
      isApiError({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
    ).toBe(true);
    expect(
      isApiError({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid body',
          details: [{ path: 'email', message: 'Invalid email' }],
        },
      }),
    ).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isApiError({ error: { code: 'NOPE', message: 'x' } })).toBe(false);
    expect(isApiError({ message: 'Not found', statusCode: 404 })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
