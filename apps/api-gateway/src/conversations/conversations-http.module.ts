import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ConversationsController } from './conversations.controller';

/** REST routes of the chat domain. ChatDomainModule itself is global (AppModule). */
@Module({ imports: [ChatModule], controllers: [ConversationsController] })
export class ConversationsHttpModule {}
