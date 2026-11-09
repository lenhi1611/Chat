import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { RpcClient } from '@realtime-chat/api-messaging';
import {
  type ConversationDTO,
  conversationIdParamSchema,
  createConversationRequestSchema,
  type CreateConversationRequest,
  type ListMessagesQuery,
  listMessagesQuerySchema,
  type ListMessagesResponse,
  RPC_PATTERNS,
} from '@realtime-chat/contracts';
import type { Response } from 'express';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../auth/current-user.decorator';
import { ChatRealtimeService } from '../chat/chat-realtime.service';
import { CorrelationId } from '../http/correlation-id';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { CHAT_RPC } from '../messaging/service-clients.module';

/** Thin HTTP edge over chat-service (RPC over RabbitMQ): rules live there. */
@Controller('conversations')
export class ConversationsController {
  constructor(
    @Inject(CHAT_RPC) private readonly chat: RpcClient,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /** The caller's conversations, most recent activity first. */
  @Get()
  list(
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<ConversationDTO[]> {
    return this.chat.call(
      RPC_PATTERNS.chatConversationsList,
      { userId: caller.userId },
      correlationId,
    );
  }

  /** 201 when created; 200 when the DM already existed. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createConversationRequestSchema))
    body: CreateConversationRequest,
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConversationDTO> {
    const { conversation, created } = await this.chat.call(
      RPC_PATTERNS.chatConversationsCreate,
      { userId: caller.userId, request: body },
      correlationId,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    // Until this gateway consumes chat.conversation.created (step 7).
    if (created) this.realtime.conversationCreated(conversation);
    return conversation;
  }

  /** Cursor pagination on seq: `?before=<seq>&limit=` (default 30, max 100). */
  @Get(':id/messages')
  messages(
    @Param(new ZodValidationPipe(conversationIdParamSchema))
    params: { id: string },
    @Query(new ZodValidationPipe(listMessagesQuerySchema))
    query: ListMessagesQuery,
    @CurrentUser() caller: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<ListMessagesResponse> {
    return this.chat.call(
      RPC_PATTERNS.chatMessagesList,
      { userId: caller.userId, conversationId: params.id, ...query },
      correlationId,
    );
  }
}
