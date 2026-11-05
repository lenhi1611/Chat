import { TestBed } from '@angular/core/testing';
import { MessageBubble } from './message-bubble';
import { aMessage } from './testing';

describe('MessageBubble', () => {
  async function render(own: boolean) {
    const message = aMessage({
      text: '  hello there  ',
      senderNickname: 'guest-1a2b',
    });
    const fixture = TestBed.createComponent(MessageBubble);
    fixture.componentRef.setInput('message', message);
    fixture.componentRef.setInput('own', own);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows another user's nickname, left-aligned", async () => {
    const el = await render(false);
    expect(el.dataset['own']).toBe('false');
    expect(el.classList).toContain('items-start');
    expect(
      el.querySelector('[data-testid="message-sender"]')?.textContent,
    ).toBe('guest-1a2b');
  });

  it('labels own messages "You", right-aligned', async () => {
    const el = await render(true);
    expect(el.dataset['own']).toBe('true');
    expect(el.classList).toContain('items-end');
    expect(
      el.querySelector('[data-testid="message-sender"]')?.textContent,
    ).toBe('You');
  });

  it('renders the text as text, exactly as sent', async () => {
    const el = await render(false);
    expect(el.querySelector('[data-testid="message-text"]')?.textContent).toBe(
      '  hello there  ',
    );
    expect(el.querySelector('time')?.getAttribute('datetime')).toMatch(
      /^2026-11-04T10:00:/,
    );
  });
});
