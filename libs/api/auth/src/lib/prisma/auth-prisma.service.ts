import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/** Connection string of auth_db (provided by whoever imports the auth module). */
export const AUTH_DATABASE_URL = Symbol('AUTH_DATABASE_URL');

/**
 * Prisma client for auth_db. Only libs/api/auth may use it: other domains ask
 * the auth services instead of reading these tables.
 */
@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(AUTH_DATABASE_URL) databaseUrl: string) {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  /** Fail at startup, not on the first request, when the database is down. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
