// Fault-tolerance scenarios for the RabbitMQ split (phase 3, step 10).
//
//   npx nx run-many -t build -p api-gateway auth-service chat-service
//   npm run chaos                 # all scenarios
//   npm run chaos -- a d          # some of them
//
// Runs its own stack, isolated from `npm run serve:all`: the three apps from
// their builds (dist/), on their own RabbitMQ virtual host (`chaos`), the test
// databases (auth_test, chat_test), Redis database 15 and gateway port 3100.
// It starts and kills only the processes it spawned. Scenario (c) restarts
// the RabbitMQ container, which every running app (yours too) rides out.
//
// Needs `npm run infra:up`. Logs: dist/chaos/<app>.log. Exit code 1 if a
// scenario fails.

import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { connect as amqpConnect } from 'amqplib';
import pg from 'pg';
import { WebSocket } from 'ws';
import { ensureTestDatabase } from '../db/databases.mjs';
import { loadWorkspaceEnv, testRedisUrl, WORKSPACE_ROOT } from '../db/env.mjs';

loadWorkspaceEnv();

const VHOST = 'chaos';
const PORT = 3100;
const API = `http://localhost:${PORT}/api`;
const WS = `ws://localhost:${PORT}/ws`;
const ORIGIN = 'http://localhost:4200';
const RPC_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 3;
const LOG_DIR = join(WORKSPACE_ROOT, 'dist', 'chaos');
const RABBIT_CONTAINER = 'realtime-chat-rabbitmq';
const MANAGEMENT = `http://localhost:${process.env['RABBITMQ_MANAGEMENT_PORT'] ?? 15672}/api`;
const MANAGEMENT_AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env['RABBITMQ_USER']}:${process.env['RABBITMQ_PASSWORD']}`,
  ).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (message) => console.log(`  ${message}`);

async function until(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

// --- environment -----------------------------------------------------------------------

async function management(method, path, body) {
  const response = await fetch(`${MANAGEMENT}${path}`, {
    method,
    headers: {
      authorization: MANAGEMENT_AUTH,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`management ${method} ${path}: ${response.status}`);
  }
  return response.status === 204 || response.status === 201
    ? null
    : response.json().catch(() => null);
}

/** The `chaos` vhost: its own queues, exchange and consumers. */
async function prepareVhost() {
  await management('PUT', `/vhosts/${VHOST}`, {});
  await management(
    'PUT',
    `/permissions/${VHOST}/${process.env['RABBITMQ_USER']}`,
    {
      configure: '.*',
      write: '.*',
      read: '.*',
    },
  );
}

/** Exact message count (the management API's figures lag by seconds). */
async function queueDepth(name) {
  const connection = await amqpConnect(env.RABBITMQ_URL);
  try {
    const channel = await connection.createChannel();
    return (await channel.checkQueue(name)).messageCount;
  } finally {
    await connection.close();
  }
}

function chaosRabbitUrl() {
  const url = new URL(process.env['RABBITMQ_URL']);
  url.pathname = `/${VHOST}`;
  return url.toString();
}

let env;
async function prepareEnv() {
  env = {
    ...process.env,
    NODE_ENV: 'development',
    RABBITMQ_URL: chaosRabbitUrl(),
    RPC_TIMEOUT_MS: String(RPC_TIMEOUT_MS),
    API_GATEWAY_PORT: String(PORT),
    CORS_ORIGINS: ORIGIN,
    WS_ALLOWED_ORIGINS: ORIGIN,
    WS_MAX_AGE_SECONDS: '3600',
    DATABASE_URL_AUTH: await ensureTestDatabase('auth'),
    DATABASE_URL_CHAT: await ensureTestDatabase('chat'),
    REDIS_URL: testRedisUrl(),
    CHAT_COMMAND_MAX_ATTEMPTS: String(MAX_ATTEMPTS),
  };
}

// --- processes ---------------------------------------------------------------------------

const APPS = ['auth-service', 'chat-service', 'api-gateway'];
const running = new Map();
const logs = new Map(APPS.map((app) => [app, '']));

function start(app) {
  const main = join(WORKSPACE_ROOT, 'dist', 'apps', app, 'main.js');
  const child = spawn(process.execPath, [main], {
    cwd: WORKSPACE_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const file = createWriteStream(join(LOG_DIR, `${app}.log`), { flags: 'a' });
  const collect = (chunk) => {
    // Nest colours its output: keep the text only.
    const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, '');
    logs.set(app, logs.get(app) + text);
    file.write(text);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  running.set(app, child);
  return child;
}

async function stop(app, signal = 'SIGTERM') {
  const child = running.get(app);
  if (!child) return;
  running.delete(app);
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill(signal);
  await Promise.race([exited, sleep(10_000)]);
}

async function health() {
  try {
    const response = await fetch(`${API}/health`);
    return { status: response.status, body: await response.json() };
  } catch {
    return { status: 0, body: null };
  }
}

const healthy = async () => (await health()).status === 200;

// --- clients ---------------------------------------------------------------------------

async function http(method, path, { body, token, correlationId } = {}) {
  const started = Date.now();
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...(correlationId && { 'x-correlation-id': correlationId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    ms: Date.now() - started,
  };
}

let userSeq = 0;
function identity() {
  userSeq += 1;
  const tag = `${Date.now().toString(36).slice(-5)}${userSeq}`;
  return {
    email: `chaos_${tag}@example.test`,
    username: `chaos_${tag}`,
    displayName: `Chaos ${tag}`,
    password: 'chaos-password-123',
  };
}

async function register(correlationId) {
  const user = identity();
  const result = await http('POST', 'auth/register', {
    body: user,
    correlationId,
  });
  if (result.status !== 201) {
    throw new Error(
      `register: ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  return { ...user, id: result.body.user.id, token: result.body.accessToken };
}

async function openSocket(user) {
  const ticket = await http('POST', 'auth/ws-ticket', { token: user.token });
  if (ticket.status !== 200) throw new Error(`ws-ticket: ${ticket.status}`);
  const socket = new WebSocket(`${WS}?ticket=${ticket.body.ticket}`, {
    origin: ORIGIN,
  });
  const client = { socket, frames: [], closed: false };
  socket.on('message', (raw) => client.frames.push(JSON.parse(raw.toString())));
  socket.on('close', () => {
    client.closed = true;
  });
  await until(
    () => client.frames.some((f) => f.event === 'session.welcome'),
    5000,
    'session.welcome',
  );
  return client;
}

function send(client, conversationId, text) {
  const clientMessageId = crypto.randomUUID();
  client.socket.send(
    JSON.stringify({
      event: 'chat.send',
      data: { conversationId, clientMessageId, text },
    }),
  );
  return clientMessageId;
}

const received = (client, text) =>
  client.frames.filter(
    (f) => f.event === 'chat.message' && f.data.text === text,
  );

async function messages(user, conversationId) {
  const result = await http(
    'GET',
    `conversations/${conversationId}/messages?limit=100`,
    {
      token: user.token,
    },
  );
  return result.body.items;
}

/** A conversation whose stored seqs are 1..n without gaps or duplicates. */
function contiguous(items) {
  return items.every((message, index) => message.seq === index + 1);
}

async function chatDb(sql) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL_CHAT });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * A transient fault: with the messages table renamed (in chat_test), every
 * attempt to store fails at once with a database error (not a domain refusal).
 */
const breakMessagesTable = () =>
  chatDb('ALTER TABLE messages RENAME TO messages_chaos_off');
/** Idempotent: also repairs a previous run interrupted mid-scenario. */
const repairMessagesTable = () =>
  chatDb(`DO $$ BEGIN
    IF to_regclass('public.messages_chaos_off') IS NOT NULL THEN
      ALTER TABLE messages_chaos_off RENAME TO messages;
    END IF;
  END $$`);

/**
 * Holds a row lock on the conversation: chat-service's send transaction waits
 * on it (the transaction timeout does not interrupt a blocked statement).
 */
async function lockConversation(conversationId) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL_CHAT });
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT 1 FROM conversations WHERE id = $1 FOR UPDATE', [
    conversationId,
  ]);
  return async () => {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  };
}

// --- shared fixture ----------------------------------------------------------------------

let ann;
let ben;
let dm;
let annSocket;
let benSocket;

async function fixture() {
  ann = await register('chaos-fixture-ann');
  ben = await register('chaos-fixture-ben');
  const created = await http('POST', 'conversations', {
    token: ann.token,
    body: { type: 'dm', userId: ben.id },
  });
  dm = created.body.id;
  annSocket = await openSocket(ann);
  benSocket = await openSocket(ben);
}

const tag = () => Math.random().toString(36).slice(2, 7);

// --- scenarios ---------------------------------------------------------------------------

const scenarios = {
  async a() {
    say('chat-service stops; Ann sends 3 messages; chat-service comes back');
    await stop('chat-service');
    const texts = [1, 2, 3].map((i) => `while chat was down ${i} ${tag()}`);
    for (const text of texts) send(annSocket, dm, text);
    await sleep(1500);
    say(
      `chat.commands holds ${await queueDepth('chat.commands')} message(s) while chat-service is down`,
    );
    const errors = annSocket.frames.filter(
      (f) => f.event === 'system.error',
    ).length;
    start('chat-service');
    await until(
      () => texts.every((t) => received(benSocket, t).length > 0),
      30_000,
      'delivery',
    );
    await sleep(1500); // would a duplicate show up?
    const counts = texts.map((t) => received(benSocket, t).length);
    const stored = (await messages(ben, dm)).filter((m) =>
      texts.includes(m.text),
    );
    say(
      `Ben received each once: ${JSON.stringify(counts)}; stored: ${stored.length}; seq ${stored.map((m) => m.seq).join(',')}`,
    );
    return (
      errors === 0 &&
      counts.every((n) => n === 1) &&
      stored.length === 3 &&
      stored.map((m) => m.text).join() === texts.join() &&
      contiguous(await messages(ben, dm))
    );
  },

  async b() {
    say(
      'auth-service stops: login answers 503 in time, open sockets keep chatting',
    );
    await stop('auth-service');
    const login = await http('POST', 'auth/login', {
      body: { email: ann.email, password: ann.password },
    });
    say(
      `login → ${login.status} ${login.body?.error?.code} in ${login.ms} ms (timeout ${RPC_TIMEOUT_MS} ms)`,
    );
    const text = `auth is down ${tag()}`;
    send(annSocket, dm, text);
    await until(
      () => received(benSocket, text).length === 1,
      10_000,
      'chat without auth',
    );
    say('a message still went from Ann to Ben');
    const state = await health();
    say(`health → ${state.status} ${JSON.stringify(state.body)}`);
    start('auth-service');
    await until(healthy, 30_000, 'auth-service back');
    return (
      login.status === 503 &&
      login.body?.error?.code === 'SERVICE_UNAVAILABLE' &&
      login.ms < RPC_TIMEOUT_MS + 1000 &&
      state.status === 503 &&
      state.body?.status === 'degraded' &&
      state.body?.services?.auth === 'down'
    );
  },

  async c() {
    say(`restarting the RabbitMQ container (${RABBIT_CONTAINER})`);
    const started = Date.now();
    execFileSync('docker', ['restart', RABBIT_CONTAINER], { stdio: 'ignore' });
    say(`container back after ${Math.round((Date.now() - started) / 1000)} s`);
    await until(healthy, 120_000, 'every app reconnected');
    say(
      `health ok again ${Math.round((Date.now() - started) / 1000)} s after the restart began`,
    );
    const gatewayQueue = (await management('GET', `/queues/${VHOST}`)).find(
      (q) => q.name.startsWith('gateway.events.'),
    );
    say(
      `gateway queue re-declared: ${gatewayQueue?.name ?? 'none'} (${gatewayQueue?.consumers ?? 0} consumer)`,
    );
    const text = `after the broker restart ${tag()}`;
    send(annSocket, dm, text);
    await until(
      () => received(benSocket, text).length === 1,
      20_000,
      'chat after restart',
    );
    say('Ann → Ben works on the same sockets (command out, event back)');
    const login = await http('POST', 'auth/login', {
      body: { email: ann.email, password: ann.password },
    });
    say(`login → ${login.status}`);
    return Boolean(gatewayQueue) && login.status === 200;
  },

  async d() {
    say(
      `a command that keeps failing (database error): ${MAX_ATTEMPTS} attempts, then DLQ`,
    );
    const before = await queueDepth('chat.commands.dlq');
    const logStart = logs.get('chat-service').length;
    await breakMessagesTable();
    const text = `doomed ${tag()}`;
    const clientMessageId = send(annSocket, dm, text);
    const failure = () =>
      annSocket.frames.find(
        (f) =>
          f.event === 'system.error' &&
          f.data.clientMessageId === clientMessageId,
      );
    try {
      await until(
        () => Boolean(failure()),
        MAX_ATTEMPTS * 15_000,
        'SEND_FAILED',
      );
    } finally {
      await repairMessagesTable();
    }
    const log = logs.get('chat-service').slice(logStart);
    const retries = (
      log.match(/Command failed \(attempt \d\/\d\), will retry/g) ?? []
    ).length;
    const exhausted =
      /Command failed \d+ times, moved to chat\.commands\.dlq/.test(log);
    const after = await queueDepth('chat.commands.dlq');
    say(
      `attempts: ${retries} retried + 1 final = ${retries + 1}; moved to DLQ: ${exhausted}`,
    );
    say(
      `Ann got system.error ${failure()?.data.code} for that clientMessageId`,
    );
    say(
      `chat.commands.dlq: ${before} → ${after} message(s) (vhost "${VHOST}" at localhost:15672)`,
    );
    const stored = (await messages(ben, dm)).filter((m) => m.text === text);
    const alive = await healthy();
    say(
      `not stored: ${stored.length === 0}; chat-service still answers (health ok): ${alive}`,
    );
    return (
      retries + 1 === MAX_ATTEMPTS &&
      exhausted &&
      failure()?.data.code === 'SEND_FAILED' &&
      after === before + 1 &&
      stored.length === 0 &&
      alive
    );
  },

  async e() {
    say(
      'kill -9 chat-service while it is storing a message; the message comes back, stored once',
    );
    const release = await lockConversation(dm);
    const text = `mid-flight ${tag()}`;
    send(annSocket, dm, text);
    await sleep(1500); // chat-service is now inside its transaction, waiting on the lock
    await stop('chat-service', 'SIGKILL');
    say('chat-service killed (SIGKILL) before acking');
    await release();
    start('chat-service');
    await until(
      () => received(benSocket, text).length > 0,
      30_000,
      'redelivery',
    );
    await sleep(1500);
    const stored = (await messages(ben, dm)).filter((m) => m.text === text);
    const all = await messages(ben, dm);
    say(
      `Ben received it ${received(benSocket, text).length} time(s); stored ${stored.length} time(s); seqs contiguous: ${contiguous(all)}`,
    );
    return (
      received(benSocket, text).length === 1 &&
      stored.length === 1 &&
      contiguous(all)
    );
  },

  async f() {
    say(
      'auth-service stops; a registration times out; auth-service comes back: no ghost user',
    );
    await stop('auth-service');
    const ghost = identity();
    const attempt = await http('POST', 'auth/register', { body: ghost });
    say(
      `register → ${attempt.status} ${attempt.body?.error?.code} in ${attempt.ms} ms`,
    );
    await sleep(500); // the request has expired in auth.rpc by now
    start('auth-service');
    await until(healthy, 30_000, 'auth-service back');
    await sleep(1000);
    const db = new pg.Client({ connectionString: env.DATABASE_URL_AUTH });
    await db.connect();
    const rows = await db.query(
      'SELECT count(*)::int AS n FROM users WHERE email = $1',
      [ghost.email],
    );
    await db.end();
    const login = await http('POST', 'auth/login', {
      body: { email: ghost.email, password: ghost.password },
    });
    say(
      `users with that email: ${rows.rows[0].n}; login → ${login.status} ${login.body?.error?.code}`,
    );
    return (
      attempt.status === 503 && rows.rows[0].n === 0 && login.status === 401
    );
  },

  async g() {
    say('one correlation id across the three apps (register → user sync)');
    const id = `chaos-corr-${tag()}`;
    await register(id);
    // The gateway logs a request once its response is finished: wait for all.
    await until(
      () => APPS.every((app) => logs.get(app).includes(id)),
      10_000,
      'the three logs',
    ).catch(() => undefined);
    const seen = APPS.filter((app) => logs.get(app).includes(id));
    for (const app of APPS) {
      const line = logs
        .get(app)
        .split('\n')
        .find((l) => l.includes(id));
      say(
        `${app}: ${line ? line.slice(line.indexOf('LOG') + 4, line.indexOf('LOG') + 130).trim() : '(none)'}`,
      );
    }
    return seen.length === 3;
  },
};

// --- main --------------------------------------------------------------------------------

async function main() {
  const wanted = process.argv.slice(2).filter((s) => s in scenarios);
  const selected = wanted.length > 0 ? wanted : Object.keys(scenarios);
  for (const app of APPS) {
    if (!existsSync(join(WORKSPACE_ROOT, 'dist', 'apps', app, 'main.js'))) {
      throw new Error(
        `dist/apps/${app}/main.js missing: npx nx run-many -t build -p ${APPS.join(' ')}`,
      );
    }
  }
  mkdirSync(LOG_DIR, { recursive: true });
  await prepareVhost();
  await prepareEnv();
  await repairMessagesTable();
  for (const app of APPS) start(app);
  await until(healthy, 60_000, 'the chaos stack');
  await fixture();

  const results = [];
  for (const name of selected) {
    console.log(`\n(${name})`);
    let ok = false;
    try {
      ok = await scenarios[name]();
    } catch (error) {
      say(`error: ${error.message}`);
      // Leave the stack whole for the next scenario.
      for (const app of APPS) if (!running.has(app)) start(app);
      await until(healthy, 60_000, 'recovery').catch(() => undefined);
    }
    console.log(`  → ${ok ? 'PASS' : 'FAIL'}`);
    results.push([name, ok]);
  }

  console.log(
    `\n${results.map(([n, ok]) => `${n}:${ok ? 'PASS' : 'FAIL'}`).join('  ')}`,
  );
  console.log(`logs: ${LOG_DIR}`);
  return results.every(([, ok]) => ok);
}

main()
  .then((ok) => (process.exitCode = ok ? 0 : 1))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    annSocket?.socket.close();
    benSocket?.socket.close();
    for (const app of [...running.keys()]) await stop(app);
  });
