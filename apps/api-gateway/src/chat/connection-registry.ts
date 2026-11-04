import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServerEnvelope } from '@realtime-chat/contracts';
import { WebSocket } from 'ws';
import type { Env } from '../config/env.schema';

/** The single shared room of phase 1. Rooms become real in a later phase. */
export const LOBBY_ROOM_ID = 'lobby';

/** RFC 6455 close code "going away": the server is shutting down. */
export const CLOSE_GOING_AWAY = 1001;

/** How long shutdown waits for clients to acknowledge the close frame. */
const SHUTDOWN_GRACE_MS = 1000;

export interface ConnectionInfo {
  clientId: string;
  nickname: string;
  roomId: string;
  connectedAt: Date;
  /** Heartbeat flag: cleared on each ping, set again by the client's pong. */
  isAlive: boolean;
}

/**
 * Open connections of this gateway instance, plus the heartbeat that removes
 * dead ones. In-memory: with several gateway instances each one only knows its
 * own clients (fan-out across instances is out of scope for phase 1).
 */
@Injectable()
export class ConnectionRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionRegistry.name);
  private readonly connections = new Map<WebSocket, ConnectionInfo>();
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get size(): number {
    return this.connections.size;
  }

  onModuleInit(): void {
    const intervalMs = this.config.get('WS_HEARTBEAT_MS', { infer: true });
    this.heartbeat = setInterval(() => this.checkHeartbeats(), intervalMs);
    this.heartbeat.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.heartbeat);
    const sockets = [...this.connections.keys()];
    await Promise.all(
      sockets.map((socket) => {
        const closed = waitForClose(socket, SHUTDOWN_GRACE_MS);
        socket.close(CLOSE_GOING_AWAY, 'Server shutting down');
        return closed;
      }),
    );
  }

  add(
    socket: WebSocket,
    identity: Pick<ConnectionInfo, 'clientId' | 'nickname'>,
  ): ConnectionInfo {
    const info: ConnectionInfo = {
      ...identity,
      roomId: LOBBY_ROOM_ID,
      connectedAt: new Date(),
      isAlive: true,
    };
    this.connections.set(socket, info);
    socket.on('pong', () => {
      info.isAlive = true;
    });
    return info;
  }

  get(socket: WebSocket): ConnectionInfo | undefined {
    return this.connections.get(socket);
  }

  remove(socket: WebSocket): ConnectionInfo | undefined {
    const info = this.connections.get(socket);
    this.connections.delete(socket);
    return info;
  }

  send(socket: WebSocket, envelope: ServerEnvelope): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(envelope));
    }
  }

  /** Sends one frame to every open connection in a room; returns the count. */
  broadcast(roomId: string, envelope: ServerEnvelope): number {
    const frame = JSON.stringify(envelope);
    let delivered = 0;
    for (const [socket, info] of this.connections) {
      if (info.roomId === roomId && socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
        delivered++;
      }
    }
    return delivered;
  }

  /**
   * The `ws` heartbeat pattern: a client that has not answered the previous
   * ping is terminated (its 'close' event then unregisters it via the
   * gateway); the others are pinged again.
   */
  private checkHeartbeats(): void {
    for (const [socket, info] of this.connections) {
      if (!info.isAlive) {
        this.logger.warn(`Terminating unresponsive client ${info.nickname}`);
        socket.terminate();
        continue;
      }
      info.isAlive = false;
      socket.ping();
    }
  }
}

function waitForClose(socket: WebSocket, timeoutMs: number): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.terminate();
      resolve();
    }, timeoutMs);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
