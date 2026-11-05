import { TestBed } from '@angular/core/testing';
import { provideStore, Store } from '@ngrx/store';
import { selectConnectionStatus } from '@realtime-chat/chat-data-access';
import {
  CLIENT_ID_STORAGE,
  WEB_SOCKET_FACTORY,
  type WebSocketLike,
} from '@realtime-chat/socket';
import { provideChatConnection } from './provide-chat-connection';

describe('provideChatConnection', () => {
  it('opens exactly one socket to the configured url at startup', () => {
    const sockets: { url: string; socket: WebSocketLike }[] = [];
    const factory = (url: string): WebSocketLike => {
      const socket = {
        readyState: 0,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      } as unknown as WebSocketLike;
      sockets.push({ url, socket });
      return socket;
    };
    const storage = new Map<string, string>();

    TestBed.configureTestingModule({
      providers: [
        provideStore(),
        provideChatConnection('ws://example.test/ws'),
        { provide: WEB_SOCKET_FACTORY, useValue: factory },
        {
          provide: CLIENT_ID_STORAGE,
          useValue: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => void storage.set(k, v),
          },
        },
      ],
    });
    const store = TestBed.inject(Store);

    expect(sockets).toHaveLength(1);
    const url = new URL(sockets[0].url);
    expect(url.origin + url.pathname).toBe('ws://example.test/ws');
    expect(url.searchParams.get('clientId')).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.selectSignal(selectConnectionStatus)()).toBe('connecting');
  });
});
