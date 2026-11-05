import { type INestApplicationContext, Logger } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { parseClientFrame } from './client-frame-parser';
import { createUpgradeVerifier } from './upgrade-verifier';

/**
 * Largest frame `ws` accepts; bigger ones close the connection with 1009.
 * A max-length message (2000 UTF-16 units, at most 3 UTF-8 bytes each) plus
 * the envelope stays under 6.2 KB.
 */
export const WS_MAX_PAYLOAD_BYTES = 8 * 1024;

export interface ChatWsAdapterOptions {
  path: string;
  allowedOrigins: readonly string[];
  maxPayloadBytes?: number;
}

/**
 * WsAdapter (plain `ws`, no Socket.IO) configured from runtime settings.
 *
 * Gateway decorators are evaluated before configuration is loaded, so the
 * env-driven server options (path, payload limit, upgrade checks) are applied
 * here instead of in `@WebSocketGateway()`.
 */
export class ChatWsAdapter extends WsAdapter {
  private readonly upgradeLogger = new Logger('WsUpgrade');

  constructor(
    app: INestApplicationContext,
    private readonly settings: ChatWsAdapterOptions,
  ) {
    super(app, { messageParser: parseClientFrame });
  }

  override create(port: number, options?: Record<string, unknown>) {
    return super.create(port, {
      ...options,
      path: this.settings.path,
      maxPayload: this.settings.maxPayloadBytes ?? WS_MAX_PAYLOAD_BYTES,
      verifyClient: createUpgradeVerifier(
        this.settings.allowedOrigins,
        this.upgradeLogger,
      ),
    });
  }
}
