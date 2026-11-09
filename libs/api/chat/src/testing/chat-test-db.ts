import { inject } from 'vitest';
import { ChatPrismaService } from '../lib/prisma/chat-prisma.service';

/** Client on chat_test (created and migrated by vitest.global-setup.mts). */
export function createChatTestPrisma(): ChatPrismaService {
  return new ChatPrismaService(inject('chatDatabaseUrl'));
}

/** Empties every chat table; call in `beforeEach` so tests never share rows. */
export async function truncateChatTables(
  prisma: ChatPrismaService,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "messages", "conversation_members", "conversations", "chat_users" RESTART IDENTITY CASCADE',
  );
}
