import type { APIRequestContext } from '@playwright/test';
import type {
  AuthResponse,
  ConversationDTO,
  CreateConversationRequest,
} from '@realtime-chat/contracts';

/** The api-gateway the stack under test talks to (fixed ports, see README). */
export const API_URL = process.env['API_URL'] || 'http://localhost:3000/api';
const WS_URL = API_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
/** The shell's origin: the gateway only accepts sockets from allowed origins. */
const ORIGIN = process.env['BASE_URL'] || 'http://localhost:4200';

export const PASSWORD = 'e2e-password-123';

export interface TestUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  accessToken: string;
}

/**
 * A fresh, unique account. Usernames are `e2e_` + 10 random characters
 * (the limit is 20), so runs never collide, also with people using the dev
 * app. Tests leave these accounts in the database they run against.
 */
export function newIdentity(label: string) {
  const suffix =
    Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  const username = `e2e_${suffix}`;
  return {
    username,
    displayName: `${label} ${suffix.slice(-4)}`,
    email: `${username}@example.test`,
    password: PASSWORD,
  };
}

/**
 * Registers through `request`. With a browser context's request
 * (`context.request`), the refresh cookie lands in that context: its pages
 * start signed in (silent refresh), without going through the form.
 */
export async function registerUser(
  request: APIRequestContext,
  label: string,
): Promise<TestUser> {
  const identity = newIdentity(label);
  const response = await request.post(`${API_URL}/auth/register`, {
    data: identity,
  });
  if (!response.ok()) {
    throw new Error(
      `register failed: ${response.status()} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as AuthResponse;
  return {
    id: body.user.id,
    username: body.user.username,
    displayName: body.user.displayName,
    email: body.user.email,
    accessToken: body.accessToken,
  };
}

export async function createConversation(
  request: APIRequestContext,
  owner: TestUser,
  body: CreateConversationRequest,
): Promise<ConversationDTO> {
  const response = await request.post(`${API_URL}/conversations`, {
    data: body,
    headers: { Authorization: `Bearer ${owner.accessToken}` },
  });
  if (!response.ok()) {
    throw new Error(
      `create failed: ${response.status()} ${await response.text()}`,
    );
  }
  return (await response.json()) as ConversationDTO;
}

/**
 * Sends `texts` in order as `sender`, over a WebSocket of its own (Node's
 * built-in client), the way a browser would: ticket, then chat.send frames.
 * Resolves once the server has echoed every one of them back.
 */
export async function sendMessages(
  request: APIRequestContext,
  sender: TestUser,
  conversationId: string,
  texts: readonly string[],
): Promise<void> {
  const ticketResponse = await request.post(`${API_URL}/auth/ws-ticket`, {
    headers: { Authorization: `Bearer ${sender.accessToken}` },
  });
  const { ticket } = (await ticketResponse.json()) as { ticket: string };
  // Node's WebSocket (undici) accepts headers; the browser's would not.
  const SocketWithHeaders = WebSocket as unknown as new (
    url: string,
    options: { headers: Record<string, string> },
  ) => WebSocket;
  const socket = new SocketWithHeaders(`${WS_URL}?ticket=${ticket}`, {
    headers: { origin: ORIGIN },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const pending = new Set(texts);
      socket.addEventListener('error', () => reject(new Error('socket error')));
      socket.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data)) as {
          event: string;
          data: { text?: string; userId?: string; code?: string };
        };
        if (frame.event === 'session.welcome') {
          for (const text of texts) {
            socket.send(
              JSON.stringify({
                event: 'chat.send',
                data: {
                  conversationId,
                  clientMessageId: crypto.randomUUID(),
                  text,
                },
              }),
            );
          }
        } else if (frame.event === 'chat.message' && frame.data.text) {
          pending.delete(frame.data.text);
          if (pending.size === 0) resolve();
        } else if (frame.event === 'system.error') {
          reject(new Error(`system.error ${frame.data.code}`));
        }
      });
    });
  } finally {
    socket.close();
  }
}

/** A text no other test (or a person using the dev app) will send. */
export const uniqueText = (label: string): string =>
  `${label} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
