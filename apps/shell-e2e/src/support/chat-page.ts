import { expect, type Locator, type Page } from '@playwright/test';

/** Page object for the chat as a user sees it inside the shell. */
export class ChatUser {
  readonly status: Locator;
  readonly nickname: Locator;
  readonly input: Locator;
  readonly sendButton: Locator;

  constructor(readonly page: Page) {
    this.status = page.getByTestId('connection-status');
    this.nickname = page.getByTestId('nickname');
    this.input = page.getByTestId('composer-input');
    this.sendButton = page.getByTestId('composer-send');
  }

  async open(): Promise<this> {
    await this.page.goto('/chat');
    await expect(this.page.getByTestId('chat-page')).toBeVisible();
    await this.expectConnected();
    return this;
  }

  async expectConnected(): Promise<void> {
    await expect(this.status).toHaveAttribute('data-status', 'open');
    await expect(this.status).toHaveText('Connected');
  }

  /** The server-assigned nickname, e.g. `guest-7f1c`. */
  async name(): Promise<string> {
    await expect(this.nickname).toHaveText(/^guest-[0-9a-f]{4}$/);
    return (await this.nickname.textContent())?.trim() ?? '';
  }

  async send(text: string): Promise<void> {
    await this.input.fill(text);
    await this.input.press('Enter');
    await expect(this.input).toHaveValue('');
  }

  /** The message bubble containing `text` (texts are unique per test). */
  message(text: string): Locator {
    return this.page
      .getByTestId('message')
      .filter({ has: this.page.getByText(text, { exact: true }) });
  }
}

/** A text no other test (or a person using the dev app) will send. */
export const uniqueText = (label: string): string =>
  `${label} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
