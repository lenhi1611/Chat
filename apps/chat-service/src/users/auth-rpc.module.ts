import { Module } from '@nestjs/common';
import { rpcClientProvider } from '@realtime-chat/api-messaging';
import { AUTH_RPC } from './auth-rpc-user-source';

/** The RPC client to auth-service (read-through of users). */
@Module({
  providers: [rpcClientProvider(AUTH_RPC, 'authRpc')],
  exports: [AUTH_RPC],
})
export class AuthRpcModule {}
