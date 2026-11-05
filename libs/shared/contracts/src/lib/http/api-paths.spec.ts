import { API_GLOBAL_PREFIX, API_PATHS, REFRESH_COOKIE } from './api-paths';

describe('API paths', () => {
  it('exposes the health route under the api prefix', () => {
    expect(`/${API_GLOBAL_PREFIX}/${API_PATHS.health}`).toBe('/api/health');
  });

  it('builds the messages route and encodes the id', () => {
    expect(API_PATHS.conversationMessages('abc')).toBe(
      'conversations/abc/messages',
    );
    expect(API_PATHS.conversationMessages('a/b')).toBe(
      'conversations/a%2Fb/messages',
    );
  });

  it('scopes the refresh cookie to the auth routes', () => {
    expect(REFRESH_COOKIE.path).toBe('/api/auth');
    expect(`/${API_GLOBAL_PREFIX}/${API_PATHS.auth.refresh}`).toMatch(
      new RegExp(`^${REFRESH_COOKIE.path}/`),
    );
  });
});
