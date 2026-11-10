import { API_ERROR_STATUS } from '../http/errors';
import { chatSendCommandSchema } from './command.schemas';
import { createDomainEvent, parseDomainEvent } from './domain-event';
import {
  DOMAIN_EVENTS,
  GATEWAY_EVENT_TYPES,
  gatewayEventsQueue,
  RPC_PATTERNS,
} from './messaging.constants';
import { isRpcError, RPC_CONTRACTS } from './rpc.schemas';

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const message = (conversationId = id()) => ({
  id: id(),
  conversationId,
  seq: 1,
  clientMessageId: id(),
  senderId: id(),
  text: 'hello',
  sentAt: now(),
});

describe('error table', () => {
  it('maps SERVICE_UNAVAILABLE to 503 next to the Phase 2 codes', () => {
    expect(API_ERROR_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    expect(API_ERROR_STATUS.NOT_FOUND).toBe(404);
  });

  it('recognises an RPC error by shape', () => {
    expect(isRpcError({ code: 'EMAIL_TAKEN', message: 'taken' })).toBe(true);
    expect(
      isRpcError({
        code: 'VALIDATION_FAILED',
        message: 'bad',
        details: [{ path: 'email', message: 'invalid' }],
      }),
    ).toBe(true);
    expect(isRpcError({ code: 'NOPE', message: 'x' })).toBe(false);
    expect(isRpcError(new Error('boom'))).toBe(false);
  });
});

describe('RPC contracts', () => {
  it('has a request and a reply schema for every pattern', () => {
    expect(Object.keys(RPC_CONTRACTS).sort()).toEqual(
      Object.values(RPC_PATTERNS).sort(),
    );
  });

  it('validates requests like the REST layer does (trim, lowercase, limits)', () => {
    const register = RPC_CONTRACTS[RPC_PATTERNS.authRegister].request;
    expect(
      register.parse({
        email: ' Ann@Example.Test ',
        username: 'Ann_1',
        displayName: 'Ann',
        password: 'long-enough-password',
      }),
    ).toMatchObject({ email: 'ann@example.test', username: 'ann_1' });

    const list = RPC_CONTRACTS[RPC_PATTERNS.chatMessagesList].request;
    expect(list.parse({ userId: id(), conversationId: id() })).toMatchObject({
      limit: 30,
    });
    expect(
      list.safeParse({ userId: id(), conversationId: id(), limit: 101 })
        .success,
    ).toBe(false);
    expect(list.safeParse({ conversationId: id() }).success).toBe(false);
  });

  it('carries the raw refresh token in auth sessions (the gateway sets the cookie)', () => {
    const session = RPC_CONTRACTS[RPC_PATTERNS.authLogin].response;
    const user = {
      id: id(),
      username: 'ann',
      displayName: 'Ann',
      email: 'ann@example.test',
      createdAt: now(),
    };
    const base = { accessToken: 't', expiresIn: 900, user, sid: id() };
    expect(
      session.safeParse({
        ...base,
        refreshToken: 'r',
        refreshTokenExpiresAt: now(),
      }).success,
    ).toBe(true);
    expect(session.safeParse(base).success).toBe(false);
  });

  it('answers a consumed ticket with its owner or null', () => {
    const consume = RPC_CONTRACTS[RPC_PATTERNS.authWsTicketConsume].response;
    expect(consume.parse({ owner: null })).toEqual({ owner: null });
    expect(
      consume.safeParse({ owner: { userId: id(), sid: id() } }).success,
    ).toBe(true);
  });
});

describe('chat.send command', () => {
  it('is the WebSocket payload plus sender and time, trimmed and bounded', () => {
    const command = {
      userId: id(),
      conversationId: id(),
      clientMessageId: id(),
      text: '  hi  ',
      requestedAt: now(),
    };
    expect(chatSendCommandSchema.parse(command).text).toBe('hi');
    expect(
      chatSendCommandSchema.safeParse({ ...command, text: '   ' }).success,
    ).toBe(false);
    expect(
      chatSendCommandSchema.safeParse({ ...command, text: 'x'.repeat(2001) })
        .success,
    ).toBe(false);
    expect(
      chatSendCommandSchema.safeParse({ ...command, userId: undefined })
        .success,
    ).toBe(false);
  });
});

describe('domain events', () => {
  it('round-trips through JSON with a fresh id and time', () => {
    const conversationId = id();
    const event = createDomainEvent(
      DOMAIN_EVENTS.messageCreated,
      { message: message(conversationId), recipientUserIds: [id(), id()] },
      'corr-1',
    );
    const parsed = parseDomainEvent(JSON.stringify(event));
    expect(parsed).toEqual({ ok: true, event });
    expect(event.id).not.toBe(
      createDomainEvent(
        DOMAIN_EVENTS.sessionRevoked,
        { userId: id(), sid: id() },
        'corr-2',
      ).id,
    );
  });

  it('checks the payload against the schema of its type', () => {
    const revoked = createDomainEvent(
      DOMAIN_EVENTS.sessionRevoked,
      { userId: id(), sid: id() },
      'c',
    );
    // A valid envelope whose payload belongs to another type.
    const mixed = { ...revoked, type: DOMAIN_EVENTS.userRegistered };
    expect(parseDomainEvent(mixed).ok).toBe(false);
    expect(
      parseDomainEvent({
        ...createDomainEvent(
          DOMAIN_EVENTS.messageRejected,
          {
            userId: id(),
            conversationId: id(),
            clientMessageId: id(),
            code: 'NOT_A_MEMBER',
            message: 'not a member',
          },
          'c',
        ),
      }).ok,
    ).toBe(true);
  });

  it('never throws on garbage', () => {
    expect(parseDomainEvent('{oops')).toEqual({
      ok: false,
      error: 'not valid JSON',
    });
    expect(parseDomainEvent({ type: 'chat.unknown' }).ok).toBe(false);
    expect(parseDomainEvent(null).ok).toBe(false);
  });

  it('needs at least one recipient for events pushed to users', () => {
    const result = parseDomainEvent(
      createDomainEvent(
        DOMAIN_EVENTS.messageCreated,
        { message: message(), recipientUserIds: [] },
        'c',
      ),
    );
    expect(result.ok).toBe(false);
  });
});

describe('names', () => {
  it('gives each gateway instance its own events queue', () => {
    expect(gatewayEventsQueue('a1')).toBe('gateway.events.a1');
    expect(GATEWAY_EVENT_TYPES).not.toContain(DOMAIN_EVENTS.userRegistered);
  });
});
