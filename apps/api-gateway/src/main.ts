import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@realtime-chat/contracts';
import { AppModule } from './app/app.module';
import { configureApp, connectGatewayEvents } from './app/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  app.enableShutdownHooks();
  // Each instance has its own events queue: a fresh id per process.
  const instanceId = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  connectGatewayEvents(app, instanceId);

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
  // After listen: HTTP answers (503 from health) while RabbitMQ is down;
  // this waits, retrying, until the events queue is consumed.
  await app.startAllMicroservices();
  Logger.log(`Receiving service events on instance ${instanceId}`);

  Logger.log(
    `API gateway listening on http://localhost:${port}/${API_GLOBAL_PREFIX}` +
      ` (WebSocket: ws://localhost:${port}${config.get('WS_PATH', { infer: true })})`,
  );
}

bootstrap();
