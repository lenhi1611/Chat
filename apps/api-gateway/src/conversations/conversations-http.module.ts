import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';

/** REST routes answered by chat-service (RPC). */
@Module({ controllers: [ConversationsController] })
export class ConversationsHttpModule {}
