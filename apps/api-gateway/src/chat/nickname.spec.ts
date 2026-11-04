import { nicknameFor } from './nickname';

describe('nicknameFor', () => {
  it('is derived from the first hex digits of the clientId', () => {
    expect(nicknameFor('7F1C2A4E-9b3d-4c5e-8f6a-1b2c3d4e5f60')).toBe(
      'guest-7f1c',
    );
  });

  it('is stable for the same clientId', () => {
    const id = crypto.randomUUID();
    expect(nicknameFor(id)).toBe(nicknameFor(id));
  });
});
