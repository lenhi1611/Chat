import { expect, test } from '@playwright/test';
import { newIdentity, PASSWORD, registerUser } from './support/api';

test.describe('authentication', () => {
  test('a guest is sent to sign in, and no socket is opened', async ({
    page,
  }) => {
    const sockets: string[] = [];
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname === '/ws') sockets.push(ws.url());
    });

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fchat$/);
    await expect(page.getByTestId('login-page')).toBeVisible();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'idle',
    );
    expect(sockets).toHaveLength(0);
  });

  test('register, stay signed in across a reload, sign out', async ({
    page,
  }) => {
    const identity = newIdentity('Reg');
    await page.goto('/auth/register');
    await page.getByTestId('email').fill(identity.email);
    await page.getByTestId('username').fill(identity.username);
    await page.getByTestId('displayName').fill(identity.displayName);
    await page.getByTestId('password').fill(identity.password);
    await page.getByTestId('submit').click();

    await expect(page).toHaveURL(/\/chat$/);
    const status = page.getByTestId('connection-status');
    await expect(status).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('current-user')).toContainText(
      identity.displayName,
    );

    // The access token lives in memory only: a reload signs in again with
    // the refresh cookie (silent refresh), without the form.
    await page.reload();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('current-user')).toContainText(
      identity.displayName,
    );
    await expect(status).toHaveAttribute('data-status', 'open');

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(status).toHaveAttribute('data-status', 'closed');

    // The cookie is gone too: a reload stays signed out.
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/auth\/login\?returnUrl=%2Fchat$/);
  });

  test('a wrong password is refused; the right one goes back to returnUrl', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request, 'Login');

    await page.goto('/chat');
    await expect(page).toHaveURL(/returnUrl=%2Fchat/);
    await page.getByTestId('email').fill(user.email);
    await page.getByTestId('password').fill('not-the-password');
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.getByTestId('password').fill(PASSWORD);
    await page.getByTestId('submit').click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'open',
    );
  });

  test('signing out in one tab ends the session in the other (4401)', async ({
    context,
  }) => {
    await registerUser(context.request, 'Tabs');
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) {
      await page.goto('/chat');
      await expect(page.getByTestId('connection-status')).toHaveAttribute(
        'data-status',
        'open',
      );
    }

    let reopened = 0;
    second.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname === '/ws') reopened += 1;
    });

    await first.getByTestId('sign-out').click();
    await expect(first).toHaveURL(/\/auth\/login$/);

    // The server closes the other tab's socket with 4401: no reconnect, the
    // tab signs out locally and keeps the page to come back to.
    await expect(second).toHaveURL(/\/auth\/login\?returnUrl=%2Fchat$/);
    await expect(second.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'closed',
    );
    // Longer than the first reconnect delay (≤ 0.5s): nothing was retried.
    await second.waitForTimeout(1500);
    expect(reopened).toBe(0);
  });
});
