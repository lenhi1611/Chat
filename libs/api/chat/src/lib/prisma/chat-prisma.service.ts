import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/** Connection string of chat_db (provided by whoever imports the chat module). */
export const CHAT_DATABASE_URL = Symbol('CHAT_DATABASE_URL');

/**
 * Prisma client for chat_db. Only libs/api/chat may use it: other domains ask
 * the chat services instead of reading these tables.
 */
@Injectable()
export class ChatPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(CHAT_DATABASE_URL) databaseUrl: string) {
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
