import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { ChatService } from '@realtime-chat/api-chat';
import { handleRpc } from '@realtime-chat/api-messaging';
import { RPC_PATTERNS } from '@realtime-chat/contracts';

/**
 * The RabbitMQ adapter of the chat domain for requests: one handler per
 * `chat.*` RPC. `userId` was verified by the gateway from the access token.
 */
@Controller()
export class ChatRpcController {
  private readonly logger = new Logger(ChatRpcController.name);

  constructor(private readonly chat: ChatService) {}

  @MessagePattern(RPC_PATTERNS.chatConversationsList)
  list(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.chatConversationsList,
      data,
      context,
      this.logger,
      ({ userId }) => this.chat.listConversations(userId),
    );
  }

  /** `created: false` when the DM already existed (the gateway answers 200). */
  @MessagePattern(RPC_PATTERNS.chatConversationsCreate)
  create(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.chatConversationsCreate,
      data,
      context,
      this.logger,
      async ({ userId, request }, { correlationId }) => {
        if (request.type === 'dm') {
          const { value, created } = await this.chat.createDm(
            userId,
            request.userId,
            correlationId,
          );
          return { conversation: value, created };
        }
        const conversation = await this.chat.createGroup(
          userId,
          request.name,
          request.memberIds,
          correlationId,
        );
        return { conversation, created: true };
      },
    );
  }

  @MessagePattern(RPC_PATTERNS.chatMessagesList)
  messages(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.chatMessagesList,
      data,
      context,
      this.logger,
      ({ userId, conversationId, before, limit }) =>
        this.chat.listMessages(userId, conversationId, { before, limit }),
    );
  }

  @MessagePattern(RPC_PATTERNS.chatPing)
  ping(@Payload() data: unknown, @Ctx() context: RmqContext) {
    return handleRpc(
      RPC_PATTERNS.chatPing,
      data,
      context,
      this.logger,
      async () => ({
        service: 'chat' as const,
        at: new Date().toISOString(),
      }),
    );
  }
}
