import { CLIENT_ID_STORAGE_KEY, loadOrCreateClientId } from './client-id';

const ID = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';
const NEW_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('loadOrCreateClientId', () => {
  it('creates and stores an id when none exists', () => {
    const setItem = vi.fn();
    expect(
      loadOrCreateClientId({ getItem: () => null, setItem }, () => NEW_ID),
    ).toBe(NEW_ID);
    expect(setItem).toHaveBeenCalledWith(CLIENT_ID_STORAGE_KEY, NEW_ID);
  });

  it('returns the stored id', () => {
    expect(
      loadOrCreateClientId(
        { getItem: () => ID, setItem: vi.fn() },
        () => NEW_ID,
      ),
    ).toBe(ID);
  });

  it('replaces a corrupted stored value', () => {
    expect(
      loadOrCreateClientId(
        { getItem: () => 'garbage', setItem: vi.fn() },
        () => NEW_ID,
      ),
    ).toBe(NEW_ID);
  });

  it('survives storage that throws on read and write', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadOrCreateClientId(throwing, () => NEW_ID)).toBe(NEW_ID);
  });

  it('works without storage', () => {
    expect(loadOrCreateClientId(null, () => NEW_ID)).toBe(NEW_ID);
  });
});
