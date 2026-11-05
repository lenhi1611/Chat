import type { AddressInfo } from 'node:net';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';

/** Every line the app logged, to assert what must never be logged. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private push = (...args: unknown[]) =>
    this.lines.push(
      args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '),
    );
  log = this.push;
  error = this.push;
  warn = this.push;
  debug = this.push;
  verbose = this.push;
  fatal = this.push;
}

export interface TestApp {
  app: INestApplication;
  /** `http://127.0.0.1:<port>/api` */
  apiUrl: string;
  logger: CapturingLogger;
  close(): Promise<void>;
}

/** The real AppModule on a random port, configured exactly like main.ts. */
export async function startTestApp(): Promise<TestApp> {
  const [{ AppModule }, { configureApp }] = await Promise.all([
    import('../app/app.module'),
    import('../app/configure-app'),
  ]);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const logger = new CapturingLogger();
  const app = moduleRef.createNestApplication({ logger });
  configureApp(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    app,
    apiUrl: `http://127.0.0.1:${port}/api`,
    logger,
    close: () => app.close(),
  };
}

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
  setCookies: string[];
}

/** JSON request helper; `cookie` and `token` are optional. */
export async function http<T = unknown>(
  apiUrl: string,
  method: string,
  path: string,
  options: {
    body?: unknown;
    token?: string;
    cookie?: string;
    raw?: string;
  } = {},
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { origin: 'http://localhost:4200' };
  if (options.body !== undefined || options.raw !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;
  if (options.cookie) headers['cookie'] = options.cookie;
  const response = await fetch(`${apiUrl}/${path}`, {
    method,
    headers,
    body:
      options.raw ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as T,
    setCookies: response.headers.getSetCookie(),
  };
}

/** Direct SQL on the test database (assertions and setup only). */
export async function withDb<T>(
  url: string,
  run: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export const truncateChat = () =>
  withDb(process.env['DATABASE_URL_CHAT'] ?? '', (db) =>
    db.query(
      'TRUNCATE TABLE messages, conversation_members, conversations RESTART IDENTITY CASCADE',
    ),
  );

export const truncateAuth = () =>
  withDb(process.env['DATABASE_URL_AUTH'] ?? '', (db) =>
    db.query('TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE'),
  );
