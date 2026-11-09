import { inject } from 'vitest';
import { AppError } from '@realtime-chat/contracts';
import { FakeUserSource } from '../testing/fake-user-source';
import { truncateChatTables } from '../testing/chat-test-db';
import { ChatService, dmKeyOf } from './chat.service';
import { ChatPrismaService } from './prisma/chat-prisma.service';
import { UserDirectory } from './user-directory';

describe('ChatService (integration, chat_test)', () => {
  let prisma: ChatPrismaService;
  let users: FakeUserSource;
  let chat: ChatService;
  const queries: string[] = [];

  beforeAll(async () => {
    prisma = new ChatPrismaService(inject('chatDatabaseUrl'), [
      { emit: 'event', level: 'query' },
    ]);
    // The client is typed without log events; the runtime emits them.
    (
      prisma as unknown as {
        $on(event: 'query', cb: (e: { query: string }) => void): void;
      }
    ).$on('query', (e) => queries.push(e.query));
    await prisma.onModuleInit();
  });
  afterAll(() => prisma.onModuleDestroy());
  beforeEach(async () => {
    await truncateChatTables(prisma);
    users = new FakeUserSource();
    chat = new ChatService(prisma, new UserDirectory(prisma, users));
    queries.length = 0;
  });

  const send = (
    senderId: string,
    conversationId: string,
    text = 'hi',
    clientMessageId = crypto.randomUUID(),
  ) => chat.saveMessage({ senderId, conversationId, clientMessageId, text });

  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'resolved',
      (e: unknown) => (e instanceof AppError ? e.code : e),
    );

  describe('DMs', () => {
    it('creates a DM with both members, then returns the same one', async () => {
      const alice = users.add('alice');
      const bob = users.add('bob');
      const first = await chat.createDm(alice.id, bob.id);
      expect(first.created).toBe(true);
      expect(first.value).toMatchObject({
        type: 'dm',
        name: null,
        lastMessage: null,
      });
      expect(first.value.members.map((m) => m.username).sort()).toEqual([
        'alice',
        'bob',
      ]);

      const again = await chat.createDm(bob.id, alice.id);
      expect(again).toEqual({ value: first.value, created: false });
    });

    it('yields one conversation when both users create it at the same time', async () => {
      const alice = users.add('alice');
      const bob = users.add('bob');
      const results = await Promise.all([
        chat.createDm(alice.id, bob.id),
        chat.createDm(bob.id, alice.id),
        chat.createDm(alice.id, bob.id),
      ]);
      expect(new Set(results.map((r) => r.value.id)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(await prisma.conversation.count()).toBe(1);
      expect(await prisma.conversation.findFirst()).toMatchObject({
        dmKey: dmKeyOf(alice.id, bob.id),
      });
    });

    it('rejects a DM with yourself or with an unknown user', async () => {
      const alice = users.add('alice');
      expect(await code(chat.createDm(alice.id, alice.id))).toBe(
        'VALIDATION_FAILED',
      );
      expect(await code(chat.createDm(alice.id, crypto.randomUUID()))).toBe(
        'VALIDATION_FAILED',
      );
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  describe('groups', () => {
    it('creates a group of the creator and the members', async () => {
      const [a, b, c] = ['ann', 'ben', 'cat'].map((n) => users.add(n));
      const group = await chat.createGroup(a.id, 'Team', [b.id, c.id]);
      expect(group).toMatchObject({ type: 'group', name: 'Team' });
      expect(group.members.map((m) => m.id).sort()).toEqual(
        [a.id, b.id, c.id].sort(),
      );
    });

    it('rejects unknown members (with their index) and the creator listed as member', async () => {
      const a = users.add('ann');
      const b = users.add('ben');
      const error = await chat
        .createGroup(a.id, 'Team', [b.id, crypto.randomUUID()])
        .catch((e: AppError) => e);
      expect(error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ path: 'memberIds.1', message: 'no such user' }],
      });
      expect(await code(chat.createGroup(a.id, 'Team', [a.id, b.id]))).toBe(
        'VALIDATION_FAILED',
      );
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  describe('messages', () => {
    it('gives 50 concurrent messages seq 1..50, no gaps, no duplicates', async () => {
      const [a, b] = ['ann', 'ben'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          send(i % 2 ? a.id : b.id, dm.id, `m${i}`),
        ),
      );

      const seqs = results.map((r) => r.value.seq).sort((x, y) => x - y);
      expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(results.every((r) => r.created)).toBe(true);
      expect(
        await prisma.conversation.findUniqueOrThrow({ where: { id: dm.id } }),
      ).toMatchObject({ lastSeq: 50 });
    });

    it('returns the stored message when the same clientMessageId is sent again', async () => {
      const [a, b] = ['ann', 'ben'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);
      const clientMessageId = crypto.randomUUID();

      const first = await send(a.id, dm.id, 'hello', clientMessageId);
      const again = await send(a.id, dm.id, 'hello (retry)', clientMessageId);
      expect(again).toEqual({ value: first.value, created: false });

      // Concurrent duplicates: one row, and the next message still gets seq 2.
      const dupId = crypto.randomUUID();
      const dups = await Promise.all(
        Array.from({ length: 5 }, () => send(a.id, dm.id, 'dup', dupId)),
      );
      expect(new Set(dups.map((d) => d.value.id)).size).toBe(1);
      expect(dups.filter((d) => d.created)).toHaveLength(1);
      expect((await send(a.id, dm.id, 'next')).value.seq).toBe(3);
      expect(await prisma.message.count()).toBe(3);
    });

    it('updates the conversation’s last message', async () => {
      const [a, b] = ['ann', 'ben'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);
      await send(a.id, dm.id, 'first');
      const last = await send(b.id, dm.id, 'second');
      const [listed] = await chat.listConversations(a.id);
      expect(listed.lastMessage).toEqual(last.value);
    });
  });

  describe('message pages (cursor on seq)', () => {
    async function conversationWith(count: number) {
      const [a, b] = ['ann', 'ben'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);
      for (let i = 1; i <= count; i += 1) await send(a.id, dm.id, `m${i}`);
      return { a, dm };
    }
    const seqs = (page: { items: { seq: number }[] }) =>
      page.items.map((m) => m.seq);

    it('pages backwards in ascending order until the first message', async () => {
      const { a, dm } = await conversationWith(7);
      const p1 = await chat.listMessages(a.id, dm.id, { limit: 3 });
      expect(seqs(p1)).toEqual([5, 6, 7]);
      expect(p1.nextBefore).toBe(5);
      const p2 = await chat.listMessages(a.id, dm.id, { before: 5, limit: 3 });
      expect(seqs(p2)).toEqual([2, 3, 4]);
      const p3 = await chat.listMessages(a.id, dm.id, {
        before: p2.nextBefore ?? 0,
        limit: 3,
      });
      expect(seqs(p3)).toEqual([1]);
      expect(p3.nextBefore).toBeNull();
    });

    it('handles an exactly full last page, an empty conversation and out-of-range cursors', async () => {
      const { a, dm } = await conversationWith(6);
      const p2 = await chat.listMessages(a.id, dm.id, { before: 4, limit: 3 });
      expect(seqs(p2)).toEqual([1, 2, 3]);
      expect(p2.nextBefore).toBeNull();

      expect(
        await chat.listMessages(a.id, dm.id, { before: 1, limit: 3 }),
      ).toEqual({
        items: [],
        nextBefore: null,
      });
      // A cursor past the end is the latest page.
      expect(
        seqs(await chat.listMessages(a.id, dm.id, { before: 999, limit: 2 })),
      ).toEqual([5, 6]);
      // A limit above the count returns everything.
      const all = await chat.listMessages(a.id, dm.id, { limit: 100 });
      expect(seqs(all)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(all.nextBefore).toBeNull();

      const [b, c] = ['bo', 'cy'].map((n) => users.add(n));
      const { value: empty } = await chat.createDm(b.id, c.id);
      expect(await chat.listMessages(b.id, empty.id, { limit: 30 })).toEqual({
        items: [],
        nextBefore: null,
      });
    });
  });

  describe('membership', () => {
    it('answers NOT_FOUND to outsiders for reading, sending and fetching', async () => {
      const [a, b, outsider] = ['ann', 'ben', 'eve'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);
      await send(a.id, dm.id);

      expect(
        await code(chat.listMessages(outsider.id, dm.id, { limit: 30 })),
      ).toBe('NOT_FOUND');
      expect(await code(send(outsider.id, dm.id))).toBe('NOT_FOUND');
      expect(await code(chat.getConversation(outsider.id, dm.id))).toBe(
        'NOT_FOUND',
      );
      // Same answer as for a conversation that does not exist.
      expect(await code(chat.getConversation(a.id, crypto.randomUUID()))).toBe(
        'NOT_FOUND',
      );
      expect(await prisma.message.count()).toBe(1);
      expect(await chat.listConversations(outsider.id)).toEqual([]);
    });

    it('lists member ids and a user’s conversation ids', async () => {
      const [a, b, c] = ['ann', 'ben', 'cat'].map((n) => users.add(n));
      const { value: dm } = await chat.createDm(a.id, b.id);
      const group = await chat.createGroup(a.id, 'G', [b.id, c.id]);
      expect((await chat.getMemberIds(group.id)).sort()).toEqual(
        [a.id, b.id, c.id].sort(),
      );
      expect(await chat.getConversationIdsForUser(c.id)).toEqual([group.id]);
      expect((await chat.getConversationIdsForUser(a.id)).sort()).toEqual(
        [dm.id, group.id].sort(),
      );
      await expect(chat.isMember(dm.id, c.id)).resolves.toBe(false);
    });
  });

  describe('conversation list', () => {
    it('sorts by latest activity: new messages and new conversations first', async () => {
      const [a, b, c, d] = ['ann', 'ben', 'cat', 'dan'].map((n) =>
        users.add(n),
      );
      const { value: withB } = await chat.createDm(a.id, b.id);
      const { value: withC } = await chat.createDm(a.id, c.id);
      const group = await chat.createGroup(a.id, 'G', [b.id, c.id]);
      const ids = async () =>
        (await chat.listConversations(a.id)).map((x) => x.id);

      expect(await ids()).toEqual([group.id, withC.id, withB.id]);
      await send(b.id, withB.id);
      expect(await ids()).toEqual([withB.id, group.id, withC.id]);
      const { value: withD } = await chat.createDm(d.id, a.id);
      expect(await ids()).toEqual([withD.id, withB.id, group.id, withC.id]);
    });

    it('runs a constant number of queries (no N+1)', async () => {
      const me = users.add('me');
      const make = async (n: number) => {
        for (let i = 0; i < n; i += 1) {
          const other = users.add(`u${i}-${crypto.randomUUID().slice(0, 4)}`);
          const { value } = await chat.createDm(me.id, other.id);
          await send(other.id, value.id, `hello ${i}`);
        }
      };
      const count = async () => {
        queries.length = 0;
        users.lookups = 0;
        const list = await chat.listConversations(me.id);
        return { list, queries: queries.length, lookups: users.lookups };
      };

      await make(2);
      const small = await count();
      await make(10);
      const large = await count();

      expect(small.list).toHaveLength(2);
      expect(large.list).toHaveLength(12);
      expect(
        large.list.every((c) => c.lastMessage && c.members.length === 2),
      ).toBe(true);
      expect(large.queries).toBe(small.queries);
      // Every member was read through once while creating the DMs, so the
      // list is served from chat_users without asking auth-service.
      expect(large.lookups).toBe(0);
      // Logged for the review: conversations, members, last messages, users.
      console.info(
        `listConversations: ${large.queries} SQL queries for 12 conversations`,
      );
      expect(large.queries).toBeLessThanOrEqual(4);
    });
  });

  describe('user directory (chat_users + read-through)', () => {
    it('fetches an unknown user once, then serves it locally', async () => {
      const directory = new UserDirectory(prisma, users);
      const ann = users.add('ann');
      expect(await directory.findSummariesByIds([ann.id])).toEqual([ann]);
      expect(users.lookups).toBe(1);
      expect(await directory.findSummariesByIds([ann.id, ann.id])).toEqual([
        ann,
      ]);
      expect(await directory.exists(ann.id)).toBe(true);
      expect(users.lookups).toBe(1);
      expect(await directory.exists(crypto.randomUUID())).toBe(false);
    });

    it('takes users from events without asking the source, idempotently', async () => {
      const directory = new UserDirectory(prisma, users);
      const ben = {
        id: crypto.randomUUID(),
        username: 'ben',
        displayName: 'Ben',
      };
      await directory.upsert(ben);
      await directory.upsert({ ...ben, displayName: 'Ben B' });
      expect(await directory.findSummariesByIds([ben.id])).toEqual([
        { ...ben, displayName: 'Ben B' },
      ]);
      expect(users.lookups).toBe(0);
    });
  });
});
