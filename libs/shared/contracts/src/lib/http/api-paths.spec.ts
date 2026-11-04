import { API_GLOBAL_PREFIX, API_PATHS } from './api-paths';

describe('API paths', () => {
  it('exposes the health route under the api prefix', () => {
    expect(`/${API_GLOBAL_PREFIX}/${API_PATHS.health}`).toBe('/api/health');
  });
});
