import { signal } from '@angular/core';
import type { ServerEnvelope } from '@realtime-chat/contracts';
import {
  type ChatSocketState,
  SocketNotOpenError,
} from '@realtime-chat/socket';
import { BehaviorSubject, Subject } from 'rxjs';

/** Stand-in for ChatSocketService; the test drives state and server events. */
export class MockChatSocket {
  readonly clientId = '7f1c2a4e-9b3d-4c5e-8f6a-1b2c3d4e5f60';
  readonly stateSubject = new BehaviorSubject<ChatSocketState>('idle');
  readonly state$ = this.stateSubject.asObservable();
  readonly state = signal<ChatSocketState>('idle');
  readonly eventsSubject = new Subject<ServerEnvelope>();
  readonly events$ = this.eventsSubject.asObservable();

  readonly connect = vi.fn(() => this.setState('connecting'));
  readonly disconnect = vi.fn(() => this.setState('closed'));
  readonly send = vi.fn<(event: string, data: unknown) => void>(() => {
    if (this.state() !== 'open') throw new SocketNotOpenError(this.state());
  });

  setState(state: ChatSocketState): void {
    this.state.set(state);
    this.stateSubject.next(state);
  }

  emit(envelope: ServerEnvelope): void {
    this.eventsSubject.next(envelope);
  }
}

export const aMessage = (
  overrides: Partial<{
    id: string;
    senderId: string;
    text: string;
    sentAt: string;
  }> = {},
) => ({
  id: crypto.randomUUID(),
  clientMessageId: crypto.randomUUID(),
  senderId: crypto.randomUUID(),
  senderNickname: 'guest-abcd',
  text: 'hello',
  sentAt: '2026-11-04T10:00:00.000Z',
  ...overrides,
});
