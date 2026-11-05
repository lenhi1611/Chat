import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { ChatError, ChatMessage, ConnectionStatus } from './chat.models';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    /** Open the app-wide connection (idempotent). Dispatched by the shell. */
    Connect: emptyProps(),
    /** Close the connection on purpose; no reconnection follows. */
    Disconnect: emptyProps(),
    'Connection Status Changed': props<{ status: ConnectionStatus }>(),
    'Welcome Received': props<{ clientId: string; nickname: string }>(),
    'Send Message': props<{ text: string }>(),
    'Message Received': props<{ message: ChatMessage }>(),
    'Server Error Received': props<{ error: ChatError }>(),
    /** The user closed the error notice. */
    'Error Dismissed': emptyProps(),
  },
});
