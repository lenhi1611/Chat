import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type EventPublisher,
} from '@realtime-chat/api-messaging';
import {
  AppError,
  createDomainEvent,
  DOMAIN_EVENTS,
  type ConversationDTO,
  type ListMessagesResponse,
  type MessageDTO,
  type UserSummary,
} from '@realtime-chat/contracts';
import {
  type Conversation,
  type ConversationMember,
  type Message,
  Prisma,
} from '../generated/prisma/client';
import { toConversationDto, toMessageDto } from './conversation.mapper';
import { ChatPrismaService } from './prisma/chat-prisma.service';
import { UserDirectory } from './user-directory';

export interface Created<T> {
  value: T;
  /** False when an existing record was returned (DM already there, resent message). */
  created: boolean;
}

export interface NewMessage {
  senderId: string;
  conversationId: string;
  clientMessageId: string;
  /** Already validated and trimmed (contracts schema). */
  text: string;
}

type ConversationWithMembers = Conversation & { members: ConversationMember[] };

const notFound = () => new AppError('NOT_FOUND', 'Conversation not found');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** Two user ids, sorted and joined: the same key whoever creates the DM. */
export const dmKeyOf = (a: string, b: string) => [a, b].sort().join(':');

/**
 * Conversations and messages (chat_db). Every method taking a conversation id
 * and a user checks membership first and answers NOT_FOUND to non-members, so
 * outsiders cannot even learn that a conversation exists.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: ChatPrismaService,
    private readonly users: UserDirectory,
    /**
     * Provided by chat-service (RabbitMQ). Optional while the api-gateway
     * still runs this library in-process (it pushes to sockets itself).
     */
    @Optional()
    @Inject(EVENT_PUBLISHER)
    private readonly events?: EventPublisher,
  ) {}

  // --- events --------------------------------------------------------------

  /**
   * Stores the message (idempotent on clientMessageId) and announces it to
   * every member (`chat.message.created`), even when it was stored before: a
   * redelivered command must still reach the members (they drop duplicates
   * by id). The DB write and the event are two steps; the command consumer
   * retries the whole thing if the event cannot be published.
   * @throws AppError NOT_FOUND for non-members
   */
  async sendMessage(
    input: NewMessage,
    correlationId: string,
  ): Promise<Created<MessageDTO>> {
    const result = await this.saveMessage(input);
    await this.events?.publish(
      createDomainEvent(
        DOMAIN_EVENTS.messageCreated,
        {
          message: result.value,
          recipientUserIds: await this.getMemberIds(input.conversationId),
        },
        correlationId,
      ),
    );
    return result;
  }

  /**
   * Announces a new conversation to its members. After the DB write, without
   * an outbox: if publishing fails the caller gets an error although the
   * conversation exists (members see it on their next list).
   */
  private async conversationCreated(
    conversation: ConversationDTO,
    correlationId: string,
  ): Promise<void> {
    await this.events?.publish(
      createDomainEvent(
        DOMAIN_EVENTS.conversationCreated,
        {
          conversation,
          recipientUserIds: conversation.members.map((member) => member.id),
        },
        correlationId,
      ),
    );
  }

  // --- conversations -----------------------------------------------------

  /**
   * The DM between `callerId` and `otherUserId`, created if missing. Two users
   * creating it at the same time get the same conversation (unique dm_key).
   * @throws AppError VALIDATION_FAILED (self, unknown user)
   */
  async createDm(
    callerId: string,
    otherUserId: string,
    correlationId: string = randomUUID(),
  ): Promise<Created<ConversationDTO>> {
    if (callerId === otherUserId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Cannot start a conversation with yourself',
        [{ path: 'userId', message: 'must be another user' }],
      );
    }
    if (!(await this.users.exists(otherUserId))) {
      throw new AppError('VALIDATION_FAILED', 'User not found', [
        { path: 'userId', message: 'no such user' },
      ]);
    }

    const dmKey = dmKeyOf(callerId, otherUserId);
    const existing = await this.findDm(dmKey);
    if (existing) return { value: await this.toDto(existing), created: false };

    try {
      const now = new Date();
      const conversation = await this.prisma.conversation.create({
        data: {
          type: 'dm',
          dmKey,
          createdBy: callerId,
          lastMessageAt: now,
          createdAt: now,
          members: { create: [{ userId: callerId }, { userId: otherUserId }] },
        },
        include: { members: true },
      });
      const value = await this.toDto(conversation);
      await this.conversationCreated(value, correlationId);
      return { value, created: true };
    } catch (error) {
      // Lost the race to the other user creating the same DM.
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findDm(dmKey);
      if (!winner) throw error;
      return { value: await this.toDto(winner), created: false };
    }
  }

  /**
   * A group of the caller plus `memberIds` (others only, all existing).
   * @throws AppError VALIDATION_FAILED
   */
  async createGroup(
    callerId: string,
    name: string,
    memberIds: readonly string[],
    correlationId: string = randomUUID(),
  ): Promise<ConversationDTO> {
    if (memberIds.includes(callerId)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Do not list yourself as a member',
        [{ path: 'memberIds', message: 'must not include the creator' }],
      );
    }
    const found = await this.users.findSummariesByIds(memberIds);
    const foundIds = new Set(found.map((u) => u.id));
    const missing = memberIds.flatMap((id, index) =>
      foundIds.has(id)
        ? []
        : [{ path: `memberIds.${index}`, message: 'no such user' }],
    );
    if (missing.length > 0) {
      throw new AppError('VALIDATION_FAILED', 'Unknown members', missing);
    }

    const now = new Date();
    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'group',
        name,
        createdBy: callerId,
        lastMessageAt: now,
        createdAt: now,
        members: {
          create: [callerId, ...memberIds].map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    });
    const value = await this.toDto(conversation);
    await this.conversationCreated(value, correlationId);
    return value;
  }

  /**
   * The caller's conversations, most recent activity first, with members and
   * last message. A fixed number of queries whatever the count: conversations
   * (+ members), last messages, then users (one call to the users port).
   */
  async listConversations(userId: string): Promise<ConversationDTO[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      include: { members: true },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
    });
    return this.toDtos(conversations);
  }

  /** One conversation, for a member. @throws AppError NOT_FOUND */
  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, members: { some: { userId } } },
      include: { members: true },
    });
    if (!conversation) throw notFound();
    return this.toDto(conversation);
  }

  async isMember(conversationId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { userId: true },
    });
    return member !== null;
  }

  async getMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /** Every conversation id of a user, in one query (WebSocket rooms). */
  async getConversationIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  }

  // --- messages ----------------------------------------------------------

  /**
   * Stores a message with the next `seq` of its conversation. The counter is
   * incremented with an UPDATE that locks the conversation row, so concurrent
   * senders are serialised: seq stays 1, 2, 3… without gaps or duplicates.
   * Sending the same clientMessageId again returns the stored message.
   * @throws AppError NOT_FOUND for non-members
   */
  async saveMessage(input: NewMessage): Promise<Created<MessageDTO>> {
    if (!(await this.isMember(input.conversationId, input.senderId)))
      throw notFound();

    const existing = await this.findByClientMessageId(input);
    if (existing) return { value: toMessageDto(existing), created: false };

    try {
      const message = await this.prisma.$transaction(
        async (tx) => {
          const sentAt = new Date();
          const { lastSeq } = await tx.conversation.update({
            where: { id: input.conversationId },
            data: { lastSeq: { increment: 1 }, lastMessageAt: sentAt },
            select: { lastSeq: true },
          });
          return tx.message.create({
            data: {
              conversationId: input.conversationId,
              seq: lastSeq,
              senderId: input.senderId,
              clientMessageId: input.clientMessageId,
              text: input.text,
              sentAt,
            },
          });
        },
        // Senders of one conversation queue on its row lock: allow for it.
        { maxWait: 10_000, timeout: 10_000 },
      );
      return { value: toMessageDto(message), created: true };
    } catch (error) {
      // The same message sent twice at once: the rolled-back one returns the
      // winner (its seq increment was rolled back too, so no gap).
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findByClientMessageId(input);
      if (!winner) throw error;
      return { value: toMessageDto(winner), created: false };
    }
  }

  /**
   * A page of messages older than `before` (exclusive), ascending by seq.
   * `nextBefore` is the cursor of the next older page, or null at the start.
   * @throws AppError NOT_FOUND for non-members
   */
  async listMessages(
    userId: string,
    conversationId: string,
    page: { before?: number; limit: number },
  ): Promise<ListMessagesResponse> {
    if (!(await this.isMember(conversationId, userId))) throw notFound();
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(page.before !== undefined && { seq: { lt: page.before } }),
      },
      orderBy: { seq: 'desc' },
      // One extra row tells whether an older page exists.
      take: page.limit + 1,
    });
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).reverse();
    return {
      items: items.map(toMessageDto),
      nextBefore: hasMore && items.length > 0 ? items[0].seq : null,
    };
  }

  // --- helpers -----------------------------------------------------------

  private findDm(dmKey: string): Promise<ConversationWithMembers | null> {
    return this.prisma.conversation.findUnique({
      where: { dmKey },
      include: { members: true },
    });
  }

  private findByClientMessageId(input: NewMessage): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: {
        conversationId_senderId_clientMessageId: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          clientMessageId: input.clientMessageId,
        },
      },
    });
  }

  private async toDto(
    conversation: ConversationWithMembers,
  ): Promise<ConversationDTO> {
    const [dto] = await this.toDtos([conversation]);
    return dto;
  }

  /** Two more lookups for any number of conversations: last messages, users. */
  private async toDtos(
    conversations: ConversationWithMembers[],
  ): Promise<ConversationDTO[]> {
    if (conversations.length === 0) return [];
    const withMessages = conversations.filter((c) => c.lastSeq > 0);
    const lastMessages = withMessages.length
      ? await this.prisma.message.findMany({
          where: {
            OR: withMessages.map((c) => ({
              conversationId: c.id,
              seq: c.lastSeq,
            })),
          },
        })
      : [];
    const lastByConversation = new Map(
      lastMessages.map((m) => [m.conversationId, m]),
    );

    const memberIds = conversations.flatMap((c) =>
      c.members.map((m) => m.userId),
    );
    const users = await this.users.findSummariesByIds(memberIds);
    const usersById = new Map<string, UserSummary>(users.map((u) => [u.id, u]));

    return conversations.map((c) =>
      toConversationDto(c, usersById, lastByConversation.get(c.id) ?? null),
    );
  }
}
