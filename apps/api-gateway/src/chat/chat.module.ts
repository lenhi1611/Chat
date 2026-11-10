import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ConnectionRegistry } from './connection-registry';
import { GatewayEventsController } from './gateway-events.controller';

/**
 * The WebSocket edge: the gateway (frames → commands), the open sockets, and
 * the consumer of service events (events → frames).
 */
@Module({
  controllers: [GatewayEventsController],
  providers: [ChatGateway, ConnectionRegistry],
})
export class ChatModule {}
