import { z } from 'zod';
import { MAX_TEXT_LENGTH } from '../ws/ws.constants';
import {
  GROUP_MAX_OTHER_MEMBERS,
  GROUP_MIN_OTHER_MEMBERS,
  GROUP_NAME_MAX_LENGTH,
  MESSAGES_PAGE_DEFAULT_LIMIT,
  MESSAGES_PAGE_MAX_LIMIT,
} from './limits';
import { userSummarySchema } from './users';

export const CONVERSATION_TYPES = ['dm', 'group'] as const;

// --- DTOs -------------------------------------------------------------------

/** A stored message. `seq` is 1, 2, 3… per conversation, assigned by the server. */
export const messageDtoSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  seq: z.number().int().min(1),
  clientMessageId: z.uuid(),
  senderId: z.uuid(),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  sentAt: z.iso.datetime(),
});

export const conversationDtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(CONVERSATION_TYPES),
  /** Group name; `null` for a DM (clients show the other member's name). */
  name: z.string().nullable(),
  /** Every member, the caller included. */
  members: z.array(userSummarySchema),
  lastMessage: messageDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
});

// --- requests ---------------------------------------------------------------

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

/**
 * `POST /conversations`. 201 when created, 200 when the DM already existed.
 * Whether `userId` / `memberIds` exist, or include the caller, is checked by
 * the server (the schema cannot know who the caller is).
 */
export const createConversationRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dm'),
    userId: z.uuid(),
  }),
  z.object({
    type: z.literal('group'),
    name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH),
    memberIds: z
      .array(z.uuid())
      .min(GROUP_MIN_OTHER_MEMBERS)
      .max(GROUP_MAX_OTHER_MEMBERS)
      .refine(uniqueIds, 'must not contain duplicates'),
  }),
]);

/**
 * `GET /conversations/:id/messages?before=&limit=`. Values arrive as strings
 * and are coerced. A `limit` above the maximum is rejected, not clamped, so a
 * client bug shows up instead of silently returning fewer messages.
 */
export const listMessagesQuerySchema = z.object({
  /** Return messages with `seq < before`; omit for the latest page. */
  before: z.coerce.number().int().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MESSAGES_PAGE_MAX_LIMIT)
    .default(MESSAGES_PAGE_DEFAULT_LIMIT),
});

export const listMessagesResponseSchema = z.object({
  /** Ascending by `seq`. */
  items: z.array(messageDtoSchema),
  /** `before` for the next (older) page; `null` when there is none. */
  nextBefore: z.number().int().min(1).nullable(),
});

export const conversationIdParamSchema = z.object({ id: z.uuid() });

export const listConversationsResponseSchema = z.array(conversationDtoSchema);

export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export type MessageDTO = z.infer<typeof messageDtoSchema>;
export type ConversationDTO = z.infer<typeof conversationDtoSchema>;
export type CreateConversationRequest = z.infer<
  typeof createConversationRequestSchema
>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type ListMessagesResponse = z.infer<typeof listMessagesResponseSchema>;
