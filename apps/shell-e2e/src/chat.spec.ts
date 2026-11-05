import { expect, test } from '@playwright/test';
import { ChatUser, uniqueText } from './support/chat-page';

test.describe('lobby chat', () => {
  test('two users exchange messages in real time', async ({ browser }) => {
    // Separate contexts = separate localStorage = two different clientIds,
    // like two people on two machines.
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    try {
      const alice = await new ChatUser(await aliceContext.newPage()).open();
      const bob = await new ChatUser(await bobContext.newPage()).open();
      const aliceName = await alice.name();
      const bobName = await bob.name();
      expect(aliceName).not.toBe(bobName);

      const hello = uniqueText('hello from alice');
      await alice.send(hello);

      // Sender sees it as their own, the other user sees the sender's nickname.
      await expect(alice.message(hello)).toHaveAttribute('data-own', 'true');
      await expect(
        alice.message(hello).getByTestId('message-sender'),
      ).toHaveText('You');
      await expect(bob.message(hello)).toHaveAttribute('data-own', 'false');
      await expect(bob.message(hello).getByTestId('message-sender')).toHaveText(
        aliceName,
      );

      const reply = uniqueText('hi alice, bob here');
      await bob.send(reply);

      await expect(
        alice.message(reply).getByTestId('message-sender'),
      ).toHaveText(bobName);
      await expect(bob.message(reply)).toHaveAttribute('data-own', 'true');

      // Same order for both: the server's sentAt decides, not arrival.
      for (const user of [alice, bob]) {
        const texts = await user.page
          .getByTestId('message-text')
          .allTextContents();
        expect(texts.indexOf(hello)).toBeLessThan(texts.indexOf(reply));
      }
    } finally {
      await aliceContext.close();
      await bobContext.close();
    }
  });

  test('the shell keeps one socket while navigating in and out of the remote', async ({
    page,
  }) => {
    const sockets: string[] = [];
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname === '/ws') sockets.push(ws.url());
    });

    // The connection starts with the shell, before the remote is loaded.
    await page.goto('/');
    const user = new ChatUser(page);
    await user.expectConnected();

    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('link', { name: 'Chat', exact: true }).click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await page.getByRole('link', { name: 'Realtime Chat' }).click();
      await expect(page.getByTestId('chat-page')).toBeHidden();
    }
    await user.expectConnected();

    expect(sockets).toHaveLength(1);
    expect(new URL(sockets[0]).searchParams.get('clientId')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  test('reconnects after the connection drops and can chat again', async ({
    page,
  }) => {
    // Proxy the socket through Playwright so the test can cut it: the first
    // connection is closed by the "server" side; later ones pass through.
    let connections = 0;
    let dropFirst: (() => Promise<void>) | undefined;
    await page.routeWebSocket(
      (url) => url.pathname === '/ws',
      (ws) => {
        connections += 1;
        const server = ws.connectToServer();
        if (connections === 1) {
          dropFirst = async () => {
            await server.close();
            await ws.close({ code: 1011, reason: 'test drop' });
          };
        }
      },
    );

    const user = await new ChatUser(page).open();
    expect(dropFirst).toBeDefined();
    await dropFirst?.();

    await expect(user.status).toHaveAttribute('data-status', 'reconnecting');
    await expect(page.getByTestId('offline-hint')).toBeVisible();
    await expect(user.sendButton).toBeDisabled();

    // Backoff is 0.5s..10s; the first retry comes within ~0.5s.
    await user.expectConnected();
    expect(connections).toBe(2);
    await expect(page.getByTestId('offline-hint')).toBeHidden();

    const text = uniqueText('back online');
    await user.send(text);
    await expect(user.message(text)).toHaveAttribute('data-own', 'true');
  });
});
