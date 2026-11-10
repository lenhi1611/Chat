import { Controller, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Ctx,
  EventPattern,
  Payload,
  type RmqContext,
} from '@nestjs/microservices';
import { ChatService } from '@realtime-chat/api-chat';
import {
  consumeCommand,
  EVENT_PUBLISHER,
  type EventPublisher,
  InflightTracker,
  MESSAGING_OPTIONS,
  MessagingConnection,
  PermanentCommandError,
  type ResolvedMessagingOptions,
} from '@realtime-chat/api-messaging';
import {
  AppError,
  type ChatSendCommand,
  chatSendCommandSchema,
  COMMAND_PATTERNS,
  createDomainEvent,
  DOMAIN_EVENTS,
  type SystemErrorCode,
} from '@realtime-chat/contracts';
import { z } from 'zod';
import type { Env } from '../config/env.schema';

/** Enough of a command to tell its sender, even when the rest is invalid. */
const senderOf = z.object({
  userId: z.uuid(),
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
});

/**
 * Consumer of `chat.commands` (prefetch 1, manual ack). Store + announce via
 * ChatService.sendMessage; domain refusals are permanent (rejected event, no
 * retry); anything else is transient (retry queue, then DLQ + SEND_FAILED).
 */
@Controller()
export class ChatCommandsController {
  private readonly logger = new Logger(ChatCommandsController.name);
  private readonly maxAttempts: number;

  constructor(
    private readonly chat: ChatService,
    private readonly connection: MessagingConnection,
    private readonly tracker: InflightTracker,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(MESSAGING_OPTIONS)
    private readonly messaging: ResolvedMessagingOptions,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get('CHAT_COMMAND_MAX_ATTEMPTS', { infer: true });
  }

  @EventPattern(COMMAND_PATTERNS.chatSend)
  send(@Payload() data: unknown, @Ctx() rawContext: unknown) {
    // @EventPattern types the extra arguments as unknown.
    const context = rawContext as RmqContext;
    const { names } = this.messaging.topology;
    return consumeCommand<ChatSendCommand>(context, data, {
      schema: chatSendCommandSchema,
      queue: names.chatCommands,
      dlq: names.chatCommandsDlq,
      maxAttempts: this.maxAttempts,
      connection: this.connection,
      tracker: this.tracker,
      logger: this.logger,
      handle: async (command, { correlationId }) => {
        try {
          const { value, created } = await this.chat.sendMessage(
            {
              senderId: command.userId,
              conversationId: command.conversationId,
              clientMessageId: command.clientMessageId,
              text: command.text,
            },
            correlationId,
          );
          this.logger.log(
            `chat.send stored seq ${value.seq}${created ? '' : ' (again)'} [correlationId=${correlationId}]`,
          );
        } catch (error) {
          throw permanentIfDomain(error);
        }
      },
      reject: (command, code, message, { correlationId }) =>
        this.reject(command, code, message, correlationId),
    });
  }

  private async reject(
    command: unknown,
    code: SystemErrorCode,
    message: string,
    correlationId: string,
  ): Promise<void> {
    const sender = senderOf.safeParse(command);
    if (!sender.success) {
      // Nobody to tell: dropped (acked) after logging.
      this.logger.warn(
        `Dropped an unreadable chat.send (${code}) [correlationId=${correlationId}]`,
      );
      return;
    }
    this.logger.log(
      `chat.send rejected: ${code} [correlationId=${correlationId}]`,
    );
    await this.events.publish(
      createDomainEvent(
        DOMAIN_EVENTS.messageRejected,
        { ...sender.data, code, message },
        correlationId,
      ),
    );
  }
}

/** Refusals of the domain will never succeed: no retry. */
function permanentIfDomain(error: unknown): unknown {
  if (!(error instanceof AppError)) return error;
  switch (error.code) {
    case 'NOT_FOUND':
      return new PermanentCommandError(
        'NOT_A_MEMBER',
        'You are not a member of this conversation',
      );
    case 'VALIDATION_FAILED':
      return new PermanentCommandError('INVALID_PAYLOAD', error.message);
    default:
      return error;
  }
}
