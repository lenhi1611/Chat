import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@realtime-chat/contracts';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  app.enableShutdownHooks();

  const port = config.get('API_GATEWAY_PORT', { infer: true });
  await app.listen(port);

  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `API gateway listening on http://localhost:${port}/${API_GLOBAL_PREFIX}` +
      ` (WebSocket: ws://localhost:${port}${config.get('WS_PATH', { infer: true })})`,
  );
}

bootstrap();
