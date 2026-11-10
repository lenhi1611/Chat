import { AppError } from '@realtime-chat/contracts';
import {
  createAuthTestPrisma,
  truncateAuthTables,
} from '../testing/auth-test-db';
import type { AuthPrismaService } from './prisma/auth-prisma.service';
import { UsersService } from './users.service';

describe('UsersService (integration)', () => {
  let prisma: AuthPrismaService;
  let users: UsersService;

  beforeAll(async () => {
    prisma = createAuthTestPrisma();
    await prisma.onModuleInit();
    users = new UsersService(prisma);
  });
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => truncateAuthTables(prisma));

  const create = (username: string, email = `${username}@example.test`) =>
    users.create({ email, username, displayName: username, passwordHash: 'h' });

  it('maps unique violations to EMAIL_TAKEN / USERNAME_TAKEN', async () => {
    await create('alice');
    await expect(create('alice2', 'alice@example.test')).rejects.toMatchObject(
      new AppError('EMAIL_TAKEN', 'This email is already registered'),
    );
    await expect(create('alice', 'other@example.test')).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });
  });

  it('reports the right conflict when two registrations race', async () => {
    const results = await Promise.allSettled([create('race'), create('race')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect((failure as PromiseRejectedResult).reason).toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });

  it('searches by username prefix, excluding the caller, at most 10', async () => {
    const me = await create('al_me');
    for (const name of ['alice', 'albert', 'al_x', 'bob', 'xal'])
      await create(name);
    for (let i = 0; i < 12; i += 1)
      await create(`zz${String(i).padStart(2, '0')}`);

    const found = await users.searchByUsernamePrefix('al', me.id);
    // Order is the database collation's (en_US ignores "_"), so compare sets.
    expect(found.map((u) => u.username).sort()).toEqual([
      'al_x',
      'albert',
      'alice',
    ]);
    expect(found).toContainEqual({
      id: expect.any(String),
      username: 'al_x',
      displayName: 'al_x',
    });
    expect(await users.searchByUsernamePrefix('zz', me.id)).toHaveLength(10);
  });

  it('treats _ in the prefix literally, not as a LIKE wildcard', async () => {
    const me = await create('caller');
    await create('a_b');
    await create('axb');
    const found = await users.searchByUsernamePrefix('a_', me.id);
    expect(found.map((u) => u.username)).toEqual(['a_b']);
  });

  it('finds summaries for many ids in one call, ignoring unknown and duplicate ids', async () => {
    const a = await create('aaa');
    const b = await create('bbb');
    const found = await users.findSummariesByIds([
      a.id,
      b.id,
      a.id,
      crypto.randomUUID(),
    ]);
    expect(found.map((u) => u.username).sort()).toEqual(['aaa', 'bbb']);
    expect(await users.findSummariesByIds([])).toEqual([]);
  });

  it('tells whether a user exists', async () => {
    const a = await create('exists');
    await expect(users.exists(a.id)).resolves.toBe(true);
    await expect(users.exists(crypto.randomUUID())).resolves.toBe(false);
  });
});
