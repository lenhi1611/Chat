import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { UsersController } from '../users/users.controller';
import { AuthController } from './auth.controller';

/** REST routes of auth-service (RPC). ChatModule: logout closes sockets (until step 7). */
@Module({
  imports: [ChatModule],
  controllers: [AuthController, UsersController],
})
export class AuthHttpModule {}
