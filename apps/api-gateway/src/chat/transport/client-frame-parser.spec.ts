import { INVALID_FRAME_EVENT, parseClientFrame } from './client-frame-parser';

const valid = JSON.stringify({
  event: 'chat.send',
  data: { clientMessageId: crypto.randomUUID(), text: ' hi ' },
});

describe('parseClientFrame', () => {
  it.each([
    ['a string', valid],
    ['a Buffer', Buffer.from(valid)],
    [
      'fragmented Buffers',
      [Buffer.from(valid.slice(0, 10)), Buffer.from(valid.slice(10))],
    ],
    ['an ArrayBuffer', new TextEncoder().encode(valid).buffer as ArrayBuffer],
  ])('parses a valid frame given as %s', (_label, raw) => {
    expect(parseClientFrame(raw)).toMatchObject({
      event: 'chat.send',
      data: { text: 'hi' },
    });
  });

  it('routes an invalid frame to the internal error event', () => {
    expect(parseClientFrame('{oops')).toEqual({
      event: INVALID_FRAME_EVENT,
      data: { code: 'INVALID_PAYLOAD', message: expect.any(String) },
    });
  });

  it('does not let a client name the internal event itself', () => {
    const frame = JSON.stringify({
      event: INVALID_FRAME_EVENT,
      data: { code: 'INVALID_PAYLOAD', message: 'forged' },
    });
    expect(parseClientFrame(frame)).toEqual({
      event: INVALID_FRAME_EVENT,
      data: { code: 'UNKNOWN_EVENT', message: expect.any(String) },
    });
  });
});
