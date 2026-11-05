import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ChatService } from '@realtime-chat/api-chat';
import {
  type ConversationDTO,
  conversationIdParamSchema,
  createConversationRequestSchema,
  type CreateConversationRequest,
  type ListMessagesQuery,
  listMessagesQuerySchema,
  type ListMessagesResponse,
} from '@realtime-chat/contracts';
import type { Response } from 'express';
import { ChatRealtimeService } from '../chat/chat-realtime.service';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../http/zod-validation.pipe';

/** Thin HTTP edge over ChatService (libs/api/chat): rules live there. */
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly chat: ChatService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /** The caller's conversations, most recent activity first. */
  @Get()
  list(@CurrentUser() caller: AuthenticatedUser): Promise<ConversationDTO[]> {
    return this.chat.listConversations(caller.userId);
  }

  /**
   * 201 when created (and pushed to the members' sockets as
   * conversation.created); 200 when the DM already existed.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createConversationRequestSchema))
    body: CreateConversationRequest,
    @CurrentUser() caller: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConversationDTO> {
    if (body.type === 'dm') {
      const { value, created } = await this.chat.createDm(
        caller.userId,
        body.userId,
      );
      response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
      if (created) this.realtime.conversationCreated(value);
      return value;
    }
    const group = await this.chat.createGroup(
      caller.userId,
      body.name,
      body.memberIds,
    );
    response.status(HttpStatus.CREATED);
    this.realtime.conversationCreated(group);
    return group;
  }

  /** Cursor pagination on seq: `?before=<seq>&limit=` (default 30, max 100). */
  @Get(':id/messages')
  messages(
    @Param(new ZodValidationPipe(conversationIdParamSchema))
    params: { id: string },
    @Query(new ZodValidationPipe(listMessagesQuerySchema))
    query: ListMessagesQuery,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ListMessagesResponse> {
    return this.chat.listMessages(caller.userId, params.id, query);
  }
}
