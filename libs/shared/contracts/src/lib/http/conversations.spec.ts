import {
  conversationDtoSchema,
  createConversationRequestSchema,
  listMessagesQuerySchema,
  listMessagesResponseSchema,
} from './conversations';
import {
  GROUP_MAX_OTHER_MEMBERS,
  GROUP_NAME_MAX_LENGTH,
  MESSAGES_PAGE_DEFAULT_LIMIT,
  MESSAGES_PAGE_MAX_LIMIT,
} from './limits';

const uuid = () => crypto.randomUUID();

describe('createConversationRequestSchema', () => {
  it('accepts a DM', () => {
    const userId = uuid();
    expect(
      createConversationRequestSchema.parse({ type: 'dm', userId }),
    ).toEqual({ type: 'dm', userId });
  });

  it('accepts a group and trims its name', () => {
    const memberIds = [uuid(), uuid()];
    expect(
      createConversationRequestSchema.parse({
        type: 'group',
        name: '  Team  ',
        memberIds,
      }),
    ).toEqual({ type: 'group', name: 'Team', memberIds });
  });

  it('rejects an unknown type or a body mixing both shapes', () => {
    expect(
      createConversationRequestSchema.safeParse({ type: 'channel' }).success,
    ).toBe(false);
    expect(
      createConversationRequestSchema.safeParse({
        type: 'dm',
        name: 'x',
        memberIds: [uuid()],
      }).success,
    ).toBe(false);
  });

  it('requires a uuid userId for a DM', () => {
    expect(
      createConversationRequestSchema.safeParse({ type: 'dm', userId: 'bob' })
        .success,
    ).toBe(false);
  });

  it('bounds the group name (1..60 after trim)', () => {
    const group = (name: string) =>
      createConversationRequestSchema.safeParse({
        type: 'group',
        name,
        memberIds: [uuid()],
      }).success;
    expect(group('  ')).toBe(false);
    expect(group('x'.repeat(GROUP_NAME_MAX_LENGTH))).toBe(true);
    expect(group('x'.repeat(GROUP_NAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('bounds group members (1..49) and rejects duplicates', () => {
    const group = (memberIds: string[]) =>
      createConversationRequestSchema.safeParse({
        type: 'group',
        name: 'Team',
        memberIds,
      }).success;
    const ids = (n: number) => Array.from({ length: n }, uuid);
    expect(group([])).toBe(false);
    expect(group(ids(1))).toBe(true);
    expect(group(ids(GROUP_MAX_OTHER_MEMBERS))).toBe(true);
    expect(group(ids(GROUP_MAX_OTHER_MEMBERS + 1))).toBe(false);
    const id = uuid();
    expect(group([id, id])).toBe(false);
  });
});

describe('listMessagesQuerySchema', () => {
  it('defaults the limit and leaves before undefined (latest page)', () => {
    expect(listMessagesQuerySchema.parse({})).toEqual({
      limit: MESSAGES_PAGE_DEFAULT_LIMIT,
    });
  });

  it('coerces query-string values', () => {
    expect(
      listMessagesQuerySchema.parse({ before: '42', limit: '10' }),
    ).toEqual({ before: 42, limit: 10 });
  });

  it.each([
    ['limit above the maximum', { limit: String(MESSAGES_PAGE_MAX_LIMIT + 1) }],
    ['limit 0', { limit: '0' }],
    ['non-numeric limit', { limit: 'ten' }],
    ['before 0', { before: '0' }],
    ['fractional before', { before: '1.5' }],
  ])('rejects %s', (_label, query) => {
    expect(listMessagesQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts the maximum limit', () => {
    expect(
      listMessagesQuerySchema.parse({ limit: String(MESSAGES_PAGE_MAX_LIMIT) })
        .limit,
    ).toBe(MESSAGES_PAGE_MAX_LIMIT);
  });
});

describe('DTOs', () => {
  const message = {
    id: uuid(),
    conversationId: uuid(),
    seq: 1,
    clientMessageId: uuid(),
    senderId: uuid(),
    text: 'hi',
    sentAt: '2026-11-05T10:00:00.000Z',
  };

  it('a conversation may have no last message and no name (DM)', () => {
    expect(
      conversationDtoSchema.safeParse({
        id: uuid(),
        type: 'dm',
        name: null,
        members: [],
        lastMessage: null,
        createdAt: '2026-11-05T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('seq starts at 1 and nextBefore is null on the last page', () => {
    expect(
      listMessagesResponseSchema.safeParse({
        items: [message],
        nextBefore: null,
      }).success,
    ).toBe(true);
    expect(
      listMessagesResponseSchema.safeParse({
        items: [{ ...message, seq: 0 }],
        nextBefore: null,
      }).success,
    ).toBe(false);
  });
});
