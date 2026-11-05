import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';

/** REST routes of the chat domain. ChatDomainModule itself is global (AppModule). */
@Module({ controllers: [ConversationsController] })
export class ConversationsHttpModule {}
