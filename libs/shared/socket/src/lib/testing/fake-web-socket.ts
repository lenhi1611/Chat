import type { WebSocketLike } from '../chat-socket.config';

/** Test double for the browser WebSocket; the test plays the server. */
export class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  static get last(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error('No FakeWebSocket created yet');
    return socket;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  readyState: WebSocketLike['readyState'] = 0;
  readonly sent: string[] = [];
  readonly closeCalls: (number | undefined)[] = [];
  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closeCalls.push(code);
    this.readyState = 3;
  }

  // --- server side -----------------------------------------------------------

  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.call(this as never, new Event('open'));
  }

  serverSend(data: unknown): void {
    this.onmessage?.call(this as never, { data } as MessageEvent);
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.call(this as never, { code } as CloseEvent);
  }
}
