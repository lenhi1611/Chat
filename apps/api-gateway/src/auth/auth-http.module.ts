import { Module } from '@nestjs/common';
import { UsersController } from '../users/users.controller';
import { AuthController } from './auth.controller';

/** REST routes answered by auth-service (RPC). */
@Module({ controllers: [AuthController, UsersController] })
export class AuthHttpModule {}
