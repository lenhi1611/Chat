import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { selectConnectionStatus } from '@realtime-chat/chat-data-access';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideMockStore({
          selectors: [{ selector: selectConnectionStatus, value: 'open' }],
        }),
      ],
    }).compileComponents();
  });

  it('renders the header with a link to the chat MFE', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header')?.textContent).toContain(
      'Realtime Chat',
    );
    expect(compiled.querySelector('a[href="/chat"]')).toBeTruthy();
    expect(
      compiled.querySelector('[data-testid="connection-status"]')?.textContent,
    ).toContain('Connected');
  });
});
