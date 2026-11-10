import { Test } from '@nestjs/testing';
import { MessagingConnection } from '@realtime-chat/api-messaging';
import { AppError } from '@realtime-chat/contracts';
import type { Response } from 'express';
import { AUTH_RPC, CHAT_RPC } from '../messaging/service-clients.module';
import { HealthController } from './health.controller';

const up = { call: async () => ({ service: 'auth', at: '' }) };
const down = {
  call: async () => {
    throw new AppError('SERVICE_UNAVAILABLE', 'no answer');
  },
};

async function check(chat: typeof up | typeof down, connected = true) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: AUTH_RPC, useValue: up },
      { provide: CHAT_RPC, useValue: chat },
      {
        provide: MessagingConnection,
        useValue: { isConnected: () => connected },
      },
    ],
  }).compile();
  let status = 0;
  const response = {
    status: (code: number) => {
      status = code;
      return response;
    },
  } as unknown as Response;
  const body = await moduleRef.get(HealthController).check('corr', response);
  return { status, body };
}

describe('HealthController', () => {
  it('reports ok (200) when RabbitMQ and both services answer', async () => {
    expect(await check(up)).toEqual({
      status: 200,
      body: {
        status: 'ok',
        services: { auth: 'up', chat: 'up', rabbitmq: 'up' },
      },
    });
  });

  it('reports degraded (503) and which part is down', async () => {
    expect(await check(down)).toEqual({
      status: 503,
      body: {
        status: 'degraded',
        services: { auth: 'up', chat: 'down', rabbitmq: 'up' },
      },
    });
    expect((await check(up, false)).body.services.rabbitmq).toBe('down');
  });
});
