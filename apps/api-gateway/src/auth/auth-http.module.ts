import { Module } from '@nestjs/common';
import { UsersController } from '../users/users.controller';
import { AuthController } from './auth.controller';

/** REST routes of the auth domain. AuthModule itself is global (AppModule). */
@Module({ controllers: [AuthController, UsersController] })
export class AuthHttpModule {}
