import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatRealtimeService } from './chat-realtime.service';
import { ConnectionRegistry } from './connection-registry';

/** The WebSocket edge: gateway, open sockets, pushes from REST. */
@Module({
  providers: [ChatGateway, ConnectionRegistry, ChatRealtimeService],
  exports: [ChatRealtimeService],
})
export class ChatModule {}
