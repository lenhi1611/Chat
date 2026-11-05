import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import {
  ChatActions,
  type ChatError,
  selectIsConnected,
  selectIsOwnMessage,
  selectLastError,
  selectMessages,
} from '@realtime-chat/chat-data-access';
import { ChatPage } from './chat-page';
import { aMessage, isOwnBy, ME } from './testing';

describe('ChatPage', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChatPage],
      providers: [
        provideMockStore({
          selectors: [
            {
              selector: selectMessages,
              value: [aMessage({ senderId: ME, text: 'mine' }), aMessage()],
            },
            { selector: selectIsOwnMessage, value: isOwnBy(ME) },
            { selector: selectIsConnected, value: true },
            { selector: selectLastError, value: null },
          ],
        }),
      ],
    });
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  afterEach(() => store.resetSelectors());

  async function render() {
    const fixture = TestBed.createComponent(ChatPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the messages from the store', async () => {
    const { el } = await render();
    const own = [...el.querySelectorAll('[data-testid="message"]')].map(
      (m) => (m as HTMLElement).dataset['own'],
    );
    expect(own).toEqual(['true', 'false']);
    expect(el.querySelector('[data-testid="offline-hint"]')).toBeNull();
  });

  it('dispatches sendMessage with the composed text', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector(
      '[data-testid="composer-input"]',
    ) as HTMLInputElement;
    input.value = ' hello ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(store.dispatch).toHaveBeenCalledWith(
      ChatActions.sendMessage({ text: 'hello' }),
    );
  });

  it('shows the offline hint and disables sending when not connected', async () => {
    store.overrideSelector(selectIsConnected, false);
    const { el } = await render();
    expect(el.querySelector('[data-testid="offline-hint"]')).toBeTruthy();
    expect(
      (el.querySelector('[data-testid="composer-send"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('shows the last error and dispatches errorDismissed on close', async () => {
    const error: ChatError = {
      code: 'NOT_CONNECTED',
      message: 'socket not open',
      at: '2026-11-04T10:00:00.000Z',
    };
    store.overrideSelector(selectLastError, error);
    const { el } = await render();

    const notice = el.querySelector(
      '[data-testid="chat-error"]',
    ) as HTMLElement;
    expect(notice.dataset['code']).toBe('NOT_CONNECTED');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toContain('Not connected to the server');

    (
      el.querySelector(
        '[data-testid="chat-error-dismiss"]',
      ) as HTMLButtonElement
    ).click();
    expect(store.dispatch).toHaveBeenCalledWith(ChatActions.errorDismissed());
  });
});
