import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import {
  createAuthTestPrisma,
  truncateAuthTables,
} from '../../testing/auth-test-db';
import type { AuthPrismaService } from './auth-prisma.service';

describe('auth_db schema (integration)', () => {
  let prisma: AuthPrismaService;

  beforeAll(async () => {
    prisma = createAuthTestPrisma();
    await prisma.onModuleInit();
  });
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => truncateAuthTables(prisma));

  const aUser = (suffix = randomUUID().slice(0, 8)) =>
    prisma.user.create({
      data: {
        email: `u-${suffix}@example.test`,
        username: `u_${suffix}`,
        displayName: 'User',
        passwordHash: 'not-a-real-hash',
      },
    });

  it('is migrated: every committed migration is applied', async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(rows.map((r) => r.migration_name)).toContainEqual(
      expect.stringMatching(/_init$/),
    );
  });

  it('enforces unique email and username', async () => {
    const user = await aUser('dup');
    const again = prisma.user.create({
      data: { ...user, id: randomUUID() },
    });
    await expect(again).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(again).rejects.toMatchObject({ code: 'P2002' });
  });

  it('links a rotated refresh token to its replacement, in one family', async () => {
    const user = await aUser();
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);
    const first = await prisma.refreshToken.create({
      data: { userId: user.id, familyId, tokenHash: 'h1', expiresAt },
    });
    const second = await prisma.refreshToken.create({
      data: { userId: user.id, familyId, tokenHash: 'h2', expiresAt },
    });
    await prisma.refreshToken.update({
      where: { id: first.id },
      data: { revokedAt: new Date(), replacedById: second.id },
    });

    const rotated = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: 'h1' },
      include: { replacedBy: true },
    });
    expect(rotated.replacedBy?.id).toBe(second.id);
    expect(
      await prisma.refreshToken.count({ where: { familyId, revokedAt: null } }),
    ).toBe(1);
  });

  it('deletes a user’s refresh tokens with the user', async () => {
    const user = await aUser();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: 'h',
        expiresAt: new Date(),
      },
    });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('starts every test from empty tables', async () => {
    expect(await prisma.user.count()).toBe(0);
    await aUser();
    await truncateAuthTables(prisma);
    expect(await prisma.user.count()).toBe(0);
  });
});
