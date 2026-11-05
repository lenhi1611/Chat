import { USERNAME_MAX_LENGTH } from './limits';
import { searchUsersQuerySchema, userSummarySchema } from './users';

describe('searchUsersQuerySchema', () => {
  it('trims and lowercases the prefix', () => {
    expect(searchUsersQuerySchema.parse({ q: '  AL ' })).toEqual({ q: 'al' });
  });

  it('needs at least 2 characters after trimming', () => {
    expect(searchUsersQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(searchUsersQuerySchema.safeParse({}).success).toBe(false);
  });

  it('caps the prefix at the username length', () => {
    expect(
      searchUsersQuerySchema.safeParse({
        q: 'a'.repeat(USERNAME_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe('userSummarySchema', () => {
  it('requires a uuid id', () => {
    expect(
      userSummarySchema.safeParse({ id: '1', username: 'a', displayName: 'A' })
        .success,
    ).toBe(false);
  });
});
