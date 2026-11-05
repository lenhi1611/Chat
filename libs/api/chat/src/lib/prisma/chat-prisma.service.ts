import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../../generated/prisma/client';

/** Connection string of chat_db (provided by whoever imports the chat module). */
export const CHAT_DATABASE_URL = Symbol('CHAT_DATABASE_URL');

/** Optional Prisma log settings (tests count queries with `level: 'query'`). */
export const CHAT_PRISMA_LOG = Symbol('CHAT_PRISMA_LOG');

/**
 * Prisma client for chat_db. Only libs/api/chat may use it: other domains ask
 * the chat services instead of reading these tables.
 */
@Injectable()
export class ChatPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(CHAT_DATABASE_URL) databaseUrl: string,
    @Optional() @Inject(CHAT_PRISMA_LOG) log?: Prisma.LogDefinition[],
  ) {
    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      ...(log && { log }),
    });
  }

  /**
   * Fail at startup, not on the first request, when the database is down or
   * the credentials are wrong. With a driver adapter `$connect()` alone opens
   * no connection (the pg pool is lazy), so run a real query.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
