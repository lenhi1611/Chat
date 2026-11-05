import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ConnectionRegistry } from './connection-registry';

@Module({
  providers: [ChatGateway, ConnectionRegistry],
})
export class ChatModule {}
