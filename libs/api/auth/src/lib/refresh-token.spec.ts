import { generateOpaqueToken, hashToken } from './refresh-token';

describe('refresh tokens', () => {
  it('are 32 random bytes, url-safe', () => {
    const token = generateOpaqueToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateOpaqueToken()).not.toBe(token);
  });

  it('are stored as a SHA-256 hex digest', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
