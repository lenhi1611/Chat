import { ChatService } from '@realtime-chat/api-chat';
import {
  type ApiError,
  type AuthResponse,
  type ConversationDTO,
  conversationDtoSchema,
  type ListMessagesResponse,
} from '@realtime-chat/contracts';
import {
  http,
  startTestApp,
  type TestApp,
  truncateAuth,
  truncateChat,
} from '../testing/test-app';

/*
 * Conversations REST API end to end: real users (auth_test) and chat data
 * (chat_test) joined through the USERS_PORT adapter.
 */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());
beforeEach(async () => {
  await truncateAuth();
  await truncateChat();
});

const call = <T = unknown>(
  method: string,
  path: string,
  options?: Parameters<typeof http>[3],
) => http<T>(t.apiUrl, method, path, options);

interface Session {
  token: string;
  user: AuthResponse['user'];
}

async function signUp(username: string): Promise<Session> {
  const result = await call<AuthResponse>('POST', 'auth/register', {
    body: {
      email: `${username}@example.test`,
      username,
      displayName: username.toUpperCase(),
      password: 'long-enough-password',
    },
  });
  expect(result.status).toBe(201);
  return { token: result.body.accessToken, user: result.body.user };
}

const errorCode = (body: unknown) => (body as ApiError).error.code;

async function seedMessages(
  sender: Session,
  conversationId: string,
  count: number,
) {
  const chat = t.app.get(ChatService);
  for (let i = 1; i <= count; i += 1) {
    await chat.saveMessage({
      senderId: sender.user.id,
      conversationId,
      clientMessageId: crypto.randomUUID(),
      text: `message ${i}`,
    });
  }
}

describe('POST /conversations', () => {
  it('creates a DM (201), then returns the same one to either user (200)', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');

    const created = await call<ConversationDTO>('POST', 'conversations', {
      token: alice.token,
      body: { type: 'dm', userId: bob.user.id },
    });
    expect(created.status).toBe(201);
    expect(conversationDtoSchema.safeParse(created.body).success).toBe(true);
    expect(created.body.members).toEqual(
      expect.arrayContaining([
        { id: alice.user.id, username: 'alice', displayName: 'ALICE' },
        { id: bob.user.id, username: 'bob', displayName: 'BOB' },
      ]),
    );

    const again = await call<ConversationDTO>('POST', 'conversations', {
      token: bob.token,
      body: { type: 'dm', userId: alice.user.id },
    });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(created.body.id);
  });

  it('creates a group (201) with the creator as a member', async () => {
    const [a, b, c] = await Promise.all(['ann', 'ben', 'cat'].map(signUp));
    const result = await call<ConversationDTO>('POST', 'conversations', {
      token: a.token,
      body: {
        type: 'group',
        name: ' Team ',
        memberIds: [b.user.id, c.user.id],
      },
    });
    expect(result.status).toBe(201);
    expect(result.body.name).toBe('Team');
    expect(result.body.members.map((m) => m.username).sort()).toEqual([
      'ann',
      'ben',
      'cat',
    ]);
  });

  it('rejects a DM with yourself, unknown users and malformed bodies', async () => {
    const a = await signUp('ann');
    for (const body of [
      { type: 'dm', userId: a.user.id },
      { type: 'dm', userId: crypto.randomUUID() },
      { type: 'group', name: 'G', memberIds: [crypto.randomUUID()] },
      { type: 'group', name: '', memberIds: [] },
      { type: 'channel' },
    ]) {
      const result = await call('POST', 'conversations', {
        token: a.token,
        body,
      });
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(errorCode(result.body)).toBe('VALIDATION_FAILED');
    }
  });

  it('requires authentication', async () => {
    expect((await call('GET', 'conversations')).status).toBe(401);
    expect(
      (
        await call('POST', 'conversations', {
          body: { type: 'dm', userId: crypto.randomUUID() },
        })
      ).status,
    ).toBe(401);
  });
});

describe('GET /conversations', () => {
  it('lists only my conversations, newest activity first, with last message', async () => {
    const [a, b, c] = await Promise.all(['ann', 'ben', 'cat'].map(signUp));
    const dm = (
      await call<ConversationDTO>('POST', 'conversations', {
        token: a.token,
        body: { type: 'dm', userId: b.user.id },
      })
    ).body;
    const other = (
      await call<ConversationDTO>('POST', 'conversations', {
        token: b.token,
        body: { type: 'dm', userId: c.user.id },
      })
    ).body;
    await seedMessages(b, dm.id, 2);

    const mine = await call<ConversationDTO[]>('GET', 'conversations', {
      token: a.token,
    });
    expect(mine.status).toBe(200);
    expect(mine.body.map((x) => x.id)).toEqual([dm.id]);
    expect(mine.body[0].lastMessage).toMatchObject({
      seq: 2,
      text: 'message 2',
    });

    const bens = await call<ConversationDTO[]>('GET', 'conversations', {
      token: b.token,
    });
    expect(bens.body.map((x) => x.id)).toEqual([dm.id, other.id]);
  });
});

describe('GET /conversations/:id/messages', () => {
  async function dmWith(count: number) {
    const [a, b] = await Promise.all(['ann', 'ben'].map(signUp));
    const dm = (
      await call<ConversationDTO>('POST', 'conversations', {
        token: a.token,
        body: { type: 'dm', userId: b.user.id },
      })
    ).body;
    await seedMessages(a, dm.id, count);
    return { a, b, dm };
  }
  const page = (token: string, id: string, query = '') =>
    call<ListMessagesResponse>('GET', `conversations/${id}/messages${query}`, {
      token,
    });

  it('returns the latest 30 by default, ascending, with a cursor to older ones', async () => {
    const { b, dm } = await dmWith(35);
    const latest = await page(b.token, dm.id);
    expect(latest.status).toBe(200);
    expect(latest.body.items.map((m) => m.seq)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 6),
    );
    expect(latest.body.nextBefore).toBe(6);

    const older = await page(
      b.token,
      dm.id,
      `?before=${latest.body.nextBefore}`,
    );
    expect(older.body.items.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(older.body.nextBefore).toBeNull();
  });

  it('validates limit and before', async () => {
    const { a, dm } = await dmWith(1);
    for (const query of [
      '?limit=101',
      '?limit=0',
      '?before=abc',
      '?before=0',
    ]) {
      const result = await page(a.token, dm.id, query);
      expect(result.status, query).toBe(400);
      expect(errorCode(result.body)).toBe('VALIDATION_FAILED');
    }
    expect((await page(a.token, dm.id, '?limit=100')).status).toBe(200);
    expect((await page(a.token, 'not-a-uuid')).status).toBe(400);
  });

  it('answers 404 to non-members, exactly as for a missing conversation', async () => {
    const { dm } = await dmWith(3);
    const eve = await signUp('eve');
    const outsider = await page(eve.token, dm.id);
    const missing = await page(eve.token, crypto.randomUUID());
    expect(outsider.status).toBe(404);
    expect(outsider.body).toEqual(missing.body);
    expect(errorCode(outsider.body)).toBe('NOT_FOUND');
  });
});
