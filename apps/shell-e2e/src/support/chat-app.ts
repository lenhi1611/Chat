import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';
import { registerUser, type TestUser } from './api';

/** Page object: the app (shell + remotes) as one signed-in user sees it. */
export class ChatApp {
  readonly status: Locator;
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly messageList: Locator;

  constructor(
    readonly page: Page,
    readonly user: TestUser,
  ) {
    this.status = page.getByTestId('connection-status');
    this.input = page.getByTestId('composer-input');
    this.sendButton = page.getByTestId('composer-send');
    this.messageList = page.getByTestId('message-list');
  }

  /**
   * A new browser context (own cookies: another person on another machine)
   * with a freshly registered user, signed in on /chat.
   */
  static async signUp(browser: Browser, label: string): Promise<ChatApp> {
    const context = await browser.newContext();
    const user = await registerUser(context.request, label);
    const app = new ChatApp(await context.newPage(), user);
    await app.openChat();
    return app;
  }

  get context(): BrowserContext {
    return this.page.context();
  }

  async openChat(): Promise<void> {
    await this.page.goto('/chat');
    await expect(this.page.getByTestId('chat-layout')).toBeVisible();
    await this.expectConnected();
  }

  async expectConnected(): Promise<void> {
    await expect(this.status).toHaveAttribute('data-status', 'open');
  }

  conversationItem(title: string): Locator {
    return this.page
      .getByTestId('conversation-item')
      .filter({ has: this.page.getByText(title, { exact: true }) });
  }

  async openConversation(title: string): Promise<void> {
    await this.conversationItem(title).click();
    await expect(this.page.getByTestId('conversation-heading')).toHaveText(
      title,
    );
  }

  /** Through the "New" dialog; ends on the new conversation. */
  async startDm(other: TestUser): Promise<void> {
    await this.page.getByTestId('new-conversation').click();
    await this.pickUser(other);
    await this.page.getByTestId('create-conversation').click();
    await expect(this.page.getByTestId('conversation-heading')).toHaveText(
      other.displayName,
    );
  }

  async startGroup(name: string, members: readonly TestUser[]): Promise<void> {
    await this.page.getByTestId('new-conversation').click();
    await this.page.getByTestId('mode-group').click();
    await this.page.getByTestId('group-name').fill(name);
    for (const member of members) await this.pickUser(member);
    await this.page.getByTestId('create-conversation').click();
    await expect(this.page.getByTestId('conversation-heading')).toHaveText(
      name,
    );
  }

  private async pickUser(user: TestUser): Promise<void> {
    await this.page.getByTestId('user-search').fill(user.username);
    const result = this.page
      .getByTestId('search-result')
      .filter({ hasText: `@${user.username}` });
    await result.click();
    await expect(
      this.page
        .getByTestId('selected-user')
        .filter({ hasText: user.displayName }),
    ).toBeVisible();
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

  messageTexts(): Promise<string[]> {
    return this.page.getByTestId('message-text').allTextContents();
  }
}
