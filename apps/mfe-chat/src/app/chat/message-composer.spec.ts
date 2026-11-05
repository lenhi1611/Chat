import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { MAX_TEXT_LENGTH } from '@realtime-chat/contracts';
import { MessageComposer } from './message-composer';

describe('MessageComposer', () => {
  let fixture: ComponentFixture<MessageComposer>;
  let el: HTMLElement;
  let sent: string[];

  const input = () =>
    el.querySelector('[data-testid="composer-input"]') as HTMLInputElement;
  const sendButton = () =>
    el.querySelector('[data-testid="composer-send"]') as HTMLButtonElement;

  async function type(text: string) {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit() {
    // Same path as pressing Enter in the field: the form's submit event.
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(MessageComposer);
    sent = [];
    fixture.componentInstance.send.subscribe((text) => sent.push(text));
    await fixture.whenStable();
    el = fixture.nativeElement;
  });

  it('sends the trimmed text and clears the field', async () => {
    await type('  hello  ');
    expect(sendButton().disabled).toBe(false);

    await submit();

    expect(sent).toEqual(['hello']);
    expect(input().value).toBe('');
    expect(sendButton().disabled).toBe(true);
  });

  it('sends with a click on "Send"', async () => {
    await type('hi');
    sendButton().click();
    await fixture.whenStable();
    expect(sent).toEqual(['hi']);
  });

  it('does not send blank text', async () => {
    await type('   ');
    expect(sendButton().disabled).toBe(true);
    await submit();
    expect(sent).toEqual([]);
  });

  it('blocks sending while not connected but keeps the draft', async () => {
    fixture.componentRef.setInput('enabled', false);
    await type('draft');

    expect(sendButton().disabled).toBe(true);
    await submit();
    expect(sent).toEqual([]);
    expect(input().value).toBe('draft');

    fixture.componentRef.setInput('enabled', true);
    await fixture.whenStable();
    expect(sendButton().disabled).toBe(false);
  });

  it('shows a counter near the limit and blocks text over it', async () => {
    const counter = () => el.querySelector('[data-testid="composer-counter"]');
    await type('x'.repeat(10));
    expect(counter()).toBeNull();

    await type('x'.repeat(MAX_TEXT_LENGTH));
    expect(counter()?.textContent).toBe(
      `${MAX_TEXT_LENGTH}/${MAX_TEXT_LENGTH}`,
    );
    expect(sendButton().disabled).toBe(false);

    await type('x'.repeat(MAX_TEXT_LENGTH + 1));
    expect(counter()?.classList).toContain('text-destructive');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(sendButton().disabled).toBe(true);
    await submit();
    expect(sent).toEqual([]);
  });
});
