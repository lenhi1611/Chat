import {
  authResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
} from './auth';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from './limits';

const valid = {
  email: 'alice@example.test',
  username: 'alice_01',
  displayName: 'Alice',
  password: 'correct horse',
};

const errorPaths = (input: unknown) =>
  registerRequestSchema
    .safeParse(input)
    .error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('registerRequestSchema', () => {
  it('accepts a valid body', () => {
    expect(registerRequestSchema.parse(valid)).toEqual(valid);
  });

  it('normalises email and username (trim + lowercase), trims displayName', () => {
    expect(
      registerRequestSchema.parse({
        ...valid,
        email: '  Alice@Example.TEST ',
        username: ' Alice_01 ',
        displayName: '  Alice  ',
      }),
    ).toMatchObject({
      email: 'alice@example.test',
      username: 'alice_01',
      displayName: 'Alice',
    });
  });

  it('never trims the password', () => {
    const password = '  spaced pass  ';
    expect(registerRequestSchema.parse({ ...valid, password }).password).toBe(
      password,
    );
  });

  it('rejects a malformed email', () => {
    expect(errorPaths({ ...valid, email: 'alice@' })).toEqual(['email']);
  });

  it.each([
    ['too short', 'a'.repeat(USERNAME_MIN_LENGTH - 1)],
    ['too long', 'a'.repeat(USERNAME_MAX_LENGTH + 1)],
    ['a dash', 'alice-01'],
    ['a space inside', 'ali ce'],
    ['a non-ascii letter', 'alicé'],
  ])('rejects a username with %s', (_label, username) => {
    expect(errorPaths({ ...valid, username })).toEqual(['username']);
  });

  it('accepts usernames at both length limits', () => {
    for (const username of [
      'a'.repeat(USERNAME_MIN_LENGTH),
      'a'.repeat(USERNAME_MAX_LENGTH),
    ]) {
      expect(errorPaths({ ...valid, username })).toEqual([]);
    }
  });

  it('bounds displayName (1..40 after trim)', () => {
    expect(errorPaths({ ...valid, displayName: '   ' })).toEqual([
      'displayName',
    ]);
    expect(
      errorPaths({
        ...valid,
        displayName: 'x'.repeat(DISPLAY_NAME_MAX_LENGTH),
      }),
    ).toEqual([]);
    expect(
      errorPaths({
        ...valid,
        displayName: 'x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      }),
    ).toEqual(['displayName']);
  });

  it('bounds the password (8..128)', () => {
    const at = (n: number) => errorPaths({ ...valid, password: 'p'.repeat(n) });
    expect(at(PASSWORD_MIN_LENGTH - 1)).toEqual(['password']);
    expect(at(PASSWORD_MIN_LENGTH)).toEqual([]);
    expect(at(PASSWORD_MAX_LENGTH)).toEqual([]);
    expect(at(PASSWORD_MAX_LENGTH + 1)).toEqual(['password']);
  });

  it('reports every missing field', () => {
    expect(errorPaths({}).sort()).toEqual(
      ['displayName', 'email', 'password', 'username'].sort(),
    );
  });
});

describe('loginRequestSchema', () => {
  it('normalises the email and only requires a non-empty password', () => {
    expect(
      loginRequestSchema.parse({ email: ' A@B.TEST', password: 'x' }),
    ).toEqual({ email: 'a@b.test', password: 'x' });
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.test', password: '' }).success,
    ).toBe(false);
  });
});

describe('authResponseSchema', () => {
  it('requires a positive integer expiresIn and a full user', () => {
    const user = {
      id: '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60',
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.test',
      createdAt: '2026-11-05T10:00:00.000Z',
    };
    expect(
      authResponseSchema.safeParse({ accessToken: 't', expiresIn: 900, user })
        .success,
    ).toBe(true);
    expect(
      authResponseSchema.safeParse({ accessToken: 't', expiresIn: 0, user })
        .success,
    ).toBe(false);
  });
});
