import { expect, test } from '@playwright/test';
import {
  createConversation,
  registerUser,
  sendMessages,
  uniqueText,
} from './support/api';
import { ChatApp } from './support/chat-app';

test.describe('conversations', () => {
  test('a DM appears for the other person live, and messages flow both ways', async ({
    browser,
  }) => {
    const alice = await ChatApp.signUp(browser, 'Alice');
    const bob = await ChatApp.signUp(browser, 'Bob');
    try {
      await alice.startDm(bob.user);

      // Pushed to Bob (conversation.created): no reload needed.
      await expect(bob.conversationItem(alice.user.displayName)).toBeVisible();

      const hello = uniqueText('hello bob');
      await alice.send(hello);
      await expect(alice.message(hello)).toHaveAttribute('data-own', 'true');
      await expect(
        alice.message(hello).getByTestId('message-sender'),
      ).toHaveText('You');

      // Bob sees the preview in the list, then the message with Alice's name.
      await expect(
        bob
          .conversationItem(alice.user.displayName)
          .getByTestId('conversation-preview'),
      ).toHaveText(hello);
      await bob.openConversation(alice.user.displayName);
      await expect(bob.message(hello)).toHaveAttribute('data-own', 'false');
      await expect(bob.message(hello).getByTestId('message-sender')).toHaveText(
        alice.user.displayName,
      );

      const reply = uniqueText('hi alice');
      await bob.send(reply);
      await expect(alice.message(reply)).toBeVisible();

      // Same order on both sides: the server's seq decides.
      for (const app of [alice, bob]) {
        const texts = await app.messageTexts();
        expect(texts.indexOf(hello)).toBeLessThan(texts.indexOf(reply));
      }
    } finally {
      await alice.context.close();
      await bob.context.close();
    }
  });

  test('messages typed quickly arrive complete and in order', async ({
    browser,
  }) => {
    const alice = await ChatApp.signUp(browser, 'Alice');
    const bob = await ChatApp.signUp(browser, 'Bob');
    try {
      await alice.startDm(bob.user);
      const texts = Array.from({ length: 15 }, (_, i) =>
        uniqueText(`burst ${i + 1}`),
      );
      // No waiting between messages: Enter right after the field is cleared.
      for (const text of texts) {
        await alice.input.fill(text);
        await alice.input.press('Enter');
      }
      await bob.openConversation(alice.user.displayName);
      await expect(bob.message(texts.at(-1) ?? '')).toBeVisible();
      expect(await bob.messageTexts()).toEqual(texts);
    } finally {
      await alice.context.close();
      await bob.context.close();
    }
  });

  test('a group reaches every member, and the newest conversation goes first', async ({
    browser,
  }) => {
    const alice = await ChatApp.signUp(browser, 'Alice');
    const bob = await ChatApp.signUp(browser, 'Bob');
    const carol = await ChatApp.signUp(browser, 'Carol');
    try {
      await alice.startDm(carol.user);
      const groupName = uniqueText('Trip');
      await alice.startGroup(groupName, [bob.user, carol.user]);

      const plan = uniqueText('plan');
      await alice.send(plan);
      for (const member of [bob, carol]) {
        await member.openConversation(groupName);
        await expect(
          member.message(plan).getByTestId('message-sender'),
        ).toHaveText(alice.user.displayName);
      }
      await expect(alice.page.getByTestId('conversation-heading')).toHaveText(
        groupName,
      );

      // Carol has the DM and the group; a new DM message moves the DM up.
      const titles = carol.page.getByTestId('conversation-title');
      await expect(titles.first()).toHaveText(groupName);
      const ping = uniqueText('ping');
      await alice.openConversation(carol.user.displayName);
      await alice.send(ping);
      await expect(titles.first()).toHaveText(alice.user.displayName);
    } finally {
      for (const app of [alice, bob, carol]) await app.context.close();
    }
  });

  test('history: latest page first, older messages on scroll-up, position kept', async ({
    browser,
    request,
  }) => {
    const bob = await ChatApp.signUp(browser, 'Bob');
    try {
      const alice = await registerUser(request, 'Alice');
      const dm = await createConversation(request, alice, {
        type: 'dm',
        userId: bob.user.id,
      });
      const texts = Array.from(
        { length: 45 },
        (_, i) => `history ${String(i + 1).padStart(2, '0')}`,
      );
      await sendMessages(request, alice, dm.id, texts);

      // A fresh page: nothing in memory, so the history comes from REST.
      await bob.page.reload();
      await bob.expectConnected();
      await bob.openConversation(alice.displayName);
      await expect(bob.message('history 45')).toBeVisible();
      expect(await bob.messageTexts()).toEqual(texts.slice(-30));

      // Scroll to the top and measure the oldest message shown, in one go
      // (no render in between); the older page is then requested.
      const topOf = (text: string) =>
        bob.messageList.evaluate((list, wanted) => {
          const item = [
            ...list.querySelectorAll('[data-testid="message"]'),
          ].find((m) => m.textContent?.includes(wanted));
          return (
            (item?.getBoundingClientRect().top ?? NaN) -
            list.getBoundingClientRect().top
          );
        }, text);
      const before = await bob.messageList.evaluate((list) => {
        list.scrollTop = 0;
        list.dispatchEvent(new Event('scroll'));
        const first = list.querySelector('[data-testid="message"]');
        return (
          (first?.getBoundingClientRect().top ?? NaN) -
          list.getBoundingClientRect().top
        );
      });
      await expect(bob.page.getByTestId('history-start')).toBeVisible();
      expect(await bob.messageTexts()).toEqual(texts);
      // 'history 16' was the oldest shown: it did not move on screen.
      expect(Math.abs((await topOf('history 16')) - before)).toBeLessThan(2);
    } finally {
      await bob.context.close();
    }
  });

  test('catches up on messages sent while the connection was down', async ({
    browser,
    request,
  }) => {
    const bob = await ChatApp.signUp(browser, 'Bob');
    try {
      const alice = await registerUser(request, 'Alice');
      const dm = await createConversation(request, alice, {
        type: 'dm',
        userId: bob.user.id,
      });
      // Proxy Bob's socket so the test can cut it, and hold back the ticket
      // of the reconnection until Alice has sent: Bob stays offline
      // ("reconnecting") exactly as long as the test wants.
      let connections = 0;
      let cut: (() => Promise<void>) | undefined;
      await bob.page.routeWebSocket(
        (url) => url.pathname === '/ws',
        (ws) => {
          connections += 1;
          const server = ws.connectToServer();
          if (connections === 1) {
            cut = async () => {
              await server.close();
              await ws.close({ code: 1011, reason: 'test drop' });
            };
          }
        },
      );
      let tickets = 0;
      let releaseTicket: () => void = () => undefined;
      const ticketReleased = new Promise<void>((resolve) => {
        releaseTicket = resolve;
      });
      await bob.page.route('**/api/auth/ws-ticket', async (route) => {
        tickets += 1;
        if (tickets > 1) await ticketReleased;
        await route.continue();
      });
      await bob.page.reload();
      await bob.expectConnected();
      await bob.openConversation(alice.displayName);

      await cut?.();
      await expect(bob.status).toHaveAttribute('data-status', 'reconnecting');
      await expect(bob.page.getByTestId('offline-hint')).toBeVisible();
      await expect(bob.sendButton).toBeDisabled();

      const missed = uniqueText('sent while bob was offline');
      await sendMessages(request, alice, dm.id, [missed]);
      await expect(bob.message(missed)).toHaveCount(0);
      releaseTicket();

      // session.welcome on the new connection → latest page reloaded.
      await expect(bob.message(missed)).toBeVisible();
      await expect(bob.page.getByTestId('offline-hint')).toBeHidden();
      expect(connections).toBe(2);

      const back = uniqueText('back online');
      await bob.send(back);
      await expect(bob.message(back)).toHaveAttribute('data-own', 'true');
    } finally {
      await bob.context.close();
    }
  });

  test('one ticket-authenticated socket while navigating in and out of the remote', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      await registerUser(context.request, 'Dana');
      const page = await context.newPage();
      const sockets: string[] = [];
      page.on('websocket', (ws) => {
        if (new URL(ws.url()).pathname === '/ws') sockets.push(ws.url());
      });

      // The socket follows the session, not the chat page: it opens on the
      // status page and survives in-app navigation to the remote and back.
      await page.goto('/status');
      const status = page.getByTestId('connection-status');
      await expect(status).toHaveAttribute('data-status', 'open');
      for (let i = 0; i < 2; i += 1) {
        await page.getByRole('link', { name: 'Chat', exact: true }).click();
        await expect(page.getByTestId('chat-layout')).toBeVisible();
        await page.goBack();
        await expect(page.getByTestId('chat-layout')).toBeHidden();
      }
      await expect(status).toHaveAttribute('data-status', 'open');

      expect(sockets).toHaveLength(1);
      const params = new URL(sockets[0]).searchParams;
      expect(params.get('ticket')).toBeTruthy();
      expect(params.has('clientId')).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("someone else's conversation is not found", async ({
    browser,
    request,
  }) => {
    const eve = await ChatApp.signUp(browser, 'Eve');
    try {
      const alice = await registerUser(request, 'Alice');
      const bob = await registerUser(request, 'Bob');
      const private_ = await createConversation(request, alice, {
        type: 'dm',
        userId: bob.id,
      });
      await eve.page.goto(`/chat/${private_.id}`);
      await expect(
        eve.page.getByTestId('conversation-not-found'),
      ).toBeVisible();
      await expect(eve.page.getByTestId('composer-input')).toHaveCount(0);
    } finally {
      await eve.context.close();
    }
  });
});
