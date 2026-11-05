import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { ConversationDTO } from '@realtime-chat/contracts';
import type { ChatError, ChatMessage, ConnectionStatus } from './chat.models';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    /** Open the app-wide connection (idempotent). Dispatched by the shell. */
    Connect: emptyProps(),
    /** Close the connection on purpose; no reconnection follows. */
    Disconnect: emptyProps(),
    'Connection Status Changed': props<{ status: ConnectionStatus }>(),
    /** Protocol v2: the server names the authenticated user. */
    'Welcome Received': props<{ userId: string }>(),
    'Send Message': props<{ conversationId: string; text: string }>(),
    /** Protocol v2; stored in the state from phase 2, step 9. */
    'Conversation Created': props<{ conversation: ConversationDTO }>(),
    'Message Received': props<{ message: ChatMessage }>(),
    'Server Error Received': props<{ error: ChatError }>(),
    /** The user closed the error notice. */
    'Error Dismissed': emptyProps(),
  },
});
