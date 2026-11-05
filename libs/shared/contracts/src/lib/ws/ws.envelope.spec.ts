import { MAX_TEXT_LENGTH } from './ws.constants';
import { createEnvelope, parseEnvelope } from './ws.envelope';
import { WS_EVENTS } from './ws.schemas';

const uuid = () => crypto.randomUUID();

const frame = (event: string, data: unknown) => JSON.stringify({ event, data });

describe('parseEnvelope (frames sent by a client)', () => {
  it('accepts a valid chat.send and trims the text', () => {
    const clientMessageId = uuid();
    const result = parseEnvelope(
      frame('chat.send', { clientMessageId, text: '  hello  ' }),
      'client',
    );

    expect(result).toEqual({
      ok: true,
      envelope: {
        event: 'chat.send',
        data: { clientMessageId, text: 'hello' },
      },
    });
  });

  it('accepts an already-parsed object', () => {
    const result = parseEnvelope(
      { event: 'chat.send', data: { clientMessageId: uuid(), text: 'hi' } },
      'client',
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['empty text', ''],
    ['whitespace-only text', ' \n\t '],
  ])('rejects %s as INVALID_PAYLOAD', (_label, text) => {
    const result = parseEnvelope(
      frame('chat.send', { clientMessageId: uuid(), text }),
      'client',
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('rejects text longer than MAX_TEXT_LENGTH as MESSAGE_TOO_LONG', () => {
    const result = parseEnvelope(
      frame('chat.send', {
        clientMessageId: uuid(),
        text: 'a'.repeat(MAX_TEXT_LENGTH + 1),
      }),
      'client',
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'MESSAGE_TOO_LONG' },
    });
  });

  it('accepts exactly MAX_TEXT_LENGTH characters, counted after trimming', () => {
    const result = parseEnvelope(
      frame('chat.send', {
        clientMessageId: uuid(),
        text: `  ${'a'.repeat(MAX_TEXT_LENGTH)}  `,
      }),
      'client',
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['a non-uuid clientMessageId', { clientMessageId: 'abc', text: 'hi' }],
    ['a missing text', { clientMessageId: crypto.randomUUID() }],
    ['a non-string text', { clientMessageId: crypto.randomUUID(), text: 42 }],
    ['a missing data object', undefined],
  ])('rejects %s as INVALID_PAYLOAD', (_label, data) => {
    const result = parseEnvelope(frame('chat.send', data), 'client');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it.each([
    ['invalid JSON', '{"event":'],
    ['a JSON array', '[1,2]'],
    ['a JSON string', '"chat.send"'],
    ['an object without event', '{"data":{}}'],
    ['an empty event name', '{"event":"","data":{}}'],
    ['null', 'null'],
  ])('rejects a broken envelope (%s) as INVALID_PAYLOAD', (_label, raw) => {
    const result = parseEnvelope(raw, 'client');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('rejects an unknown event as UNKNOWN_EVENT', () => {
    const result = parseEnvelope(frame('chat.delete', {}), 'client');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_EVENT' },
    });
  });

  it('rejects server-only events sent by a client as UNKNOWN_EVENT', () => {
    const result = parseEnvelope(
      frame('session.welcome', { clientId: uuid(), nickname: 'guest-1234' }),
      'client',
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_EVENT' },
    });
  });

  it('does not treat Object.prototype keys as events', () => {
    const result = parseEnvelope(frame('toString', {}), 'client');
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_EVENT' },
    });
  });
});

describe('parseEnvelope (frames sent by the server)', () => {
  it('accepts session.welcome', () => {
    const data = { clientId: uuid(), nickname: 'guest-ab12' };
    expect(parseEnvelope(frame('session.welcome', data), 'server')).toEqual({
      ok: true,
      envelope: { event: 'session.welcome', data },
    });
  });

  it('accepts chat.message with an ISO-8601 sentAt', () => {
    const data = {
      id: uuid(),
      clientMessageId: uuid(),
      senderId: uuid(),
      senderNickname: 'guest-ab12',
      text: 'hello',
      sentAt: new Date().toISOString(),
    };
    expect(parseEnvelope(frame('chat.message', data), 'server')).toEqual({
      ok: true,
      envelope: { event: 'chat.message', data },
    });
  });

  it('rejects chat.message with a non-ISO sentAt', () => {
    const result = parseEnvelope(
      frame('chat.message', {
        id: uuid(),
        clientMessageId: uuid(),
        senderId: uuid(),
        senderNickname: 'guest-ab12',
        text: 'hello',
        sentAt: 'yesterday',
      }),
      'server',
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });

  it('accepts system.error with a known code only', () => {
    expect(
      parseEnvelope(
        frame('system.error', { code: 'UNKNOWN_EVENT', message: 'x' }),
        'server',
      ).ok,
    ).toBe(true);
    expect(
      parseEnvelope(
        frame('system.error', { code: 'BOOM', message: 'x' }),
        'server',
      ).ok,
    ).toBe(false);
  });

  it('rejects client-only events sent by the server as UNKNOWN_EVENT', () => {
    const result = parseEnvelope(
      frame('chat.send', { clientMessageId: uuid(), text: 'hi' }),
      'server',
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_EVENT' },
    });
  });
});

describe('createEnvelope', () => {
  it('builds a frame that round-trips through parseEnvelope', () => {
    const envelope = createEnvelope(WS_EVENTS.chatSend, {
      clientMessageId: uuid(),
      text: 'hi',
    });
    expect(parseEnvelope(JSON.stringify(envelope), 'client')).toEqual({
      ok: true,
      envelope,
    });
  });
});
