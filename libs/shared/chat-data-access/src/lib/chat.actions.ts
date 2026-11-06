import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type {
  CreateConversationRequest,
  ListMessagesResponse,
} from '@realtime-chat/contracts';
import type { SocketRejection } from '@realtime-chat/socket';
import type {
  ChatError,
  ChatMessage,
  ConnectionStatus,
  Conversation,
  RequestError,
} from './chat.models';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    /**
     * Open the app-wide connection (idempotent). Dispatched when a session is
     * established, not by components.
     */
    Connect: emptyProps(),
    /** Close the connection on purpose; no reconnection follows. */
    Disconnect: emptyProps(),
    'Connection Status Changed': props<{ status: ConnectionStatus }>(),
    /** The socket stopped for good: the session is over (4401, or no ticket). */
    'Connection Rejected': props<{ reason: SocketRejection }>(),
    /** The server names the authenticated user; sent on every (re)connect. */
    'Welcome Received': props<{ userId: string }>(),
    'Send Message': props<{ conversationId: string; text: string }>(),
    'Message Received': props<{ message: ChatMessage }>(),
    'Server Error Received': props<{ error: ChatError }>(),
    /** The user closed the error notice. */
    'Error Dismissed': emptyProps(),
    /** The session ended: forget everything of the previous user. */
    'State Reset': emptyProps(),
  },
});

export const ConversationsActions = createActionGroup({
  source: 'Conversations',
  events: {
    Load: emptyProps(),
    'Load Succeeded': props<{ conversations: Conversation[] }>(),
    'Load Failed': props<{ error: RequestError }>(),
    /** The user opened a conversation (`null`: none). Loads its history. */
    Selected: props<{ conversationId: string | null }>(),
    Create: props<{ request: CreateConversationRequest }>(),
    'Create Succeeded': props<{ conversation: Conversation }>(),
    'Create Failed': props<{ error: RequestError }>(),
    /** Pushed by the server to every member (`conversation.created`). */
    'Created Remotely': props<{ conversation: Conversation }>(),
  },
});

export type PageMode = 'latest' | 'older';

export const MessagesActions = createActionGroup({
  source: 'Messages',
  events: {
    /** Scrolled to the top: fetch the page before the oldest one held. */
    'Older Requested': props<{ conversationId: string }>(),
    /** Internal: the effects decided to fetch a page. */
    'Page Requested': props<{
      conversationId: string;
      mode: PageMode;
      before: number | null;
    }>(),
    'Page Loaded': props<{
      conversationId: string;
      mode: PageMode;
      before: number | null;
      page: ListMessagesResponse;
    }>(),
    'Page Failed': props<{ conversationId: string; error: RequestError }>(),
  },
});
