import type { IncomingMessage } from 'node:http';
import type { Logger } from '@nestjs/common';
import { createUpgradeVerifier, readClientId } from './upgrade-verifier';

const clientId = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';

describe('readClientId', () => {
  it.each([
    [`/ws?clientId=${clientId}`, clientId],
    [`/ws?foo=1&clientId=${clientId}`, clientId],
    ['/ws', null],
    ['/ws?clientId=', null],
    ['/ws?clientId=not-a-uuid', null],
    [undefined, null],
  ])('%s → %s', (url, expected) => {
    expect(readClientId(url)).toBe(expected);
  });
});

describe('createUpgradeVerifier', () => {
  const logger = { warn: vi.fn() } as unknown as Logger;
  const verify = createUpgradeVerifier(['http://localhost:4200'], logger);

  const run = (origin: string | undefined, url: string) => {
    const done = vi.fn();
    verify(
      {
        origin: origin as string,
        secure: false,
        req: { url } as IncomingMessage,
      },
      done,
    );
    return done.mock.calls[0];
  };

  it('accepts an allowed origin with a valid clientId', () => {
    expect(run('http://localhost:4200', `/ws?clientId=${clientId}`)).toEqual([
      true,
    ]);
  });

  it.each([['http://evil.example'], [undefined], ['http://localhost:4200/']])(
    'rejects origin %s with 403',
    (origin) => {
      expect(run(origin, `/ws?clientId=${clientId}`)).toEqual([
        false,
        403,
        'Origin not allowed',
      ]);
    },
  );

  it('rejects an invalid clientId with 400', () => {
    expect(run('http://localhost:4200', '/ws?clientId=123')).toEqual([
      false,
      400,
      'Invalid clientId',
    ]);
  });
});
