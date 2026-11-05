import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { ChatMessage } from '@realtime-chat/chat-data-access';
import { MessageList } from './message-list';
import { aMessage, isOwnBy, ME } from './testing';

/**
 * jsdom has no layout, so the viewport gets a fake geometry:
 * 1000px of content in a 200px window. `scrollTop` stays writable.
 */
function fakeGeometry(viewport: HTMLElement) {
  Object.defineProperty(viewport, 'scrollHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    get: () => 200,
  });
}

describe('MessageList', () => {
  let fixture: ComponentFixture<MessageList>;
  let el: HTMLElement;
  let viewport: HTMLElement;
  let messages: ChatMessage[];

  async function setMessages(next: ChatMessage[]) {
    messages = next;
    fixture.componentRef.setInput('messages', messages);
    await fixture.whenStable();
  }

  function scrollTo(top: number) {
    viewport.scrollTop = top;
    viewport.dispatchEvent(new Event('scroll'));
  }

  const newMessagesButton = () =>
    el.querySelector<HTMLButtonElement>('[data-testid="new-messages"]');

  beforeEach(async () => {
    fixture = TestBed.createComponent(MessageList);
    fixture.componentRef.setInput('messages', []);
    fixture.componentRef.setInput('isOwn', isOwnBy(ME));
    await fixture.whenStable();
    el = fixture.nativeElement;
    viewport = el.querySelector('[data-testid="message-list"]') as HTMLElement;
    fakeGeometry(viewport);
  });

  it('shows an empty state, then the messages in order', async () => {
    expect(el.querySelector('[data-testid="empty-state"]')).toBeTruthy();

    await setMessages([aMessage({ text: 'a' }), aMessage({ text: 'b' })]);

    expect(el.querySelector('[data-testid="empty-state"]')).toBeNull();
    const texts = [...el.querySelectorAll('[data-testid="message-text"]')].map(
      (p) => p.textContent,
    );
    expect(texts).toEqual(['a', 'b']);
  });

  it('marks own messages using the isOwn predicate', async () => {
    await setMessages([aMessage({ senderId: ME }), aMessage()]);
    const own = [...el.querySelectorAll('[data-testid="message"]')].map(
      (m) => (m as HTMLElement).dataset['own'],
    );
    expect(own).toEqual(['true', 'false']);
  });

  it('follows new messages while the user is at the bottom', async () => {
    await setMessages([aMessage()]);
    expect(viewport.scrollTop).toBe(1000);

    await setMessages([...messages, aMessage()]);

    expect(viewport.scrollTop).toBe(1000);
    expect(newMessagesButton()).toBeNull();
  });

  it('keeps the position and counts unread messages when scrolled up', async () => {
    await setMessages([aMessage()]);
    scrollTo(100); // reading history: 700px above the bottom

    await setMessages([...messages, aMessage(), aMessage()]);

    expect(viewport.scrollTop).toBe(100);
    expect(newMessagesButton()?.textContent).toContain('New messages (2)');
  });

  it('"New messages" jumps to the bottom and hides itself', async () => {
    await setMessages([aMessage()]);
    scrollTo(100);
    await setMessages([...messages, aMessage()]);

    newMessagesButton()?.click();
    await fixture.whenStable();

    expect(viewport.scrollTop).toBe(1000);
    expect(newMessagesButton()).toBeNull();
  });

  it('scrolling back down by hand clears the unread count', async () => {
    await setMessages([aMessage()]);
    scrollTo(100);
    await setMessages([...messages, aMessage()]);

    scrollTo(790); // 10px from the bottom: within the threshold
    await fixture.whenStable();

    expect(newMessagesButton()).toBeNull();
  });

  it('always scrolls down for your own message, even when scrolled up', async () => {
    await setMessages([aMessage()]);
    scrollTo(100);

    await setMessages([...messages, aMessage({ senderId: ME })]);

    expect(viewport.scrollTop).toBe(1000);
    expect(newMessagesButton()).toBeNull();
  });
});
