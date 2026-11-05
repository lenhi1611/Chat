import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import {
  selectConnectionStatus,
  selectNickname,
} from '@realtime-chat/chat-data-access';
import { ConnectionBadge } from './connection-badge';

describe('ConnectionBadge', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ConnectionBadge],
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectConnectionStatus, value: 'connecting' },
            { selector: selectNickname, value: null },
          ],
        }),
      ],
    });
    store = TestBed.inject(MockStore);
  });

  afterEach(() => store.resetSelectors());

  const render = async () => {
    const fixture = TestBed.createComponent(ConnectionBadge);
    await fixture.whenStable();
    return fixture;
  };
  const badge = (el: HTMLElement) =>
    el.querySelector('[data-testid="connection-status"]') as HTMLElement;

  it('shows the connecting state without a nickname', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(badge(el).textContent?.trim()).toBe('Connecting…');
    expect(badge(el).dataset['status']).toBe('connecting');
    expect(el.querySelector('[data-testid="nickname"]')).toBeNull();
  });

  it('follows the store: open with the nickname, then reconnecting', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    store.overrideSelector(selectConnectionStatus, 'open');
    store.overrideSelector(selectNickname, 'guest-7f1c');
    store.refreshState();
    await fixture.whenStable();
    expect(badge(el).textContent?.trim()).toBe('Connected');
    expect(el.querySelector('[data-testid="nickname"]')?.textContent).toContain(
      'guest-7f1c',
    );

    store.overrideSelector(selectConnectionStatus, 'reconnecting');
    store.refreshState();
    await fixture.whenStable();
    expect(badge(el).textContent?.trim()).toBe('Reconnecting…');
    expect(badge(el).dataset['status']).toBe('reconnecting');
  });
});
