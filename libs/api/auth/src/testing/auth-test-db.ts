import { inject } from 'vitest';
import { AuthPrismaService } from '../lib/prisma/auth-prisma.service';

/** Client on auth_test (created and migrated by vitest.global-setup.mts). */
export function createAuthTestPrisma(): AuthPrismaService {
  return new AuthPrismaService(inject('authDatabaseUrl'));
}

/** Empties every auth table; call in `beforeEach` so tests never share rows. */
export async function truncateAuthTables(
  prisma: AuthPrismaService,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "refresh_tokens", "users" RESTART IDENTITY CASCADE',
  );
}
