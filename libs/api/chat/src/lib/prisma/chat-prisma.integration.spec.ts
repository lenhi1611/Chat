import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import {
  createChatTestPrisma,
  truncateChatTables,
} from '../../testing/chat-test-db';
import type { ChatPrismaService } from './chat-prisma.service';

describe('chat_db schema (integration)', () => {
  let prisma: ChatPrismaService;

  beforeAll(async () => {
    prisma = createChatTestPrisma();
    await prisma.onModuleInit();
  });
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(() => truncateChatTables(prisma));

  const alice = randomUUID();
  const bob = randomUUID();

  const aGroup = () =>
    prisma.conversation.create({
      data: {
        type: 'group',
        name: 'Team',
        createdBy: alice,
        members: { create: [{ userId: alice }, { userId: bob }] },
      },
    });

  const isUniqueViolation = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002';

  it('is migrated', async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(rows.map((r) => r.migration_name)).toContainEqual(
      expect.stringMatching(/_init$/),
    );
  });

  it('allows one DM per dm_key', async () => {
    const dmKey = [alice, bob].sort().join(':');
    const dm = () =>
      prisma.conversation.create({
        data: { type: 'dm', dmKey, createdBy: alice },
      });
    await dm();
    await expect(dm()).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects a second message with the same seq in a conversation', async () => {
    const { id: conversationId } = await aGroup();
    const message = (seq: number) =>
      prisma.message.create({
        data: {
          conversationId,
          seq,
          senderId: alice,
          clientMessageId: randomUUID(),
          text: 'hi',
        },
      });
    await message(1);
    await expect(message(1)).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects the same clientMessageId twice from the same sender', async () => {
    const { id: conversationId } = await aGroup();
    const clientMessageId = randomUUID();
    const send = (seq: number, senderId: string) =>
      prisma.message.create({
        data: { conversationId, seq, senderId, clientMessageId, text: 'hi' },
      });
    await send(1, alice);
    await expect(send(2, alice)).rejects.toSatisfy(isUniqueViolation);
    // Another sender may (by chance) use the same id.
    await expect(send(2, bob)).resolves.toBeDefined();
  });

  it('removes members and messages with the conversation', async () => {
    const { id } = await aGroup();
    await prisma.message.create({
      data: {
        conversationId: id,
        seq: 1,
        senderId: alice,
        clientMessageId: randomUUID(),
        text: 'hi',
      },
    });
    await prisma.conversation.delete({ where: { id } });
    expect(await prisma.conversationMember.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });

  it('starts every test from empty tables', async () => {
    expect(await prisma.conversation.count()).toBe(0);
  });
});
