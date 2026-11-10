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
import type { SocketOwner } from './transport/upgrade-verifier';

/** RFC 6455 close code "going away": the server is shutting down. */
export const CLOSE_GOING_AWAY = 1001;

/** How long shutdown waits for clients to acknowledge the close frame. */
const SHUTDOWN_GRACE_MS = 1000;

export interface ConnectionInfo extends SocketOwner {
  connectedAt: Date;
  /** Heartbeat flag: cleared on each ping, set again by the client's pong. */
  isAlive: boolean;
}

/** Map of key → set of sockets, dropping a key when its set gets empty. */
class SocketIndex {
  private readonly map = new Map<string, Set<WebSocket>>();

  get size(): number {
    return this.map.size;
  }

  add(key: string, socket: WebSocket): void {
    let sockets = this.map.get(key);
    if (!sockets) {
      sockets = new Set();
      this.map.set(key, sockets);
    }
    sockets.add(socket);
  }

  delete(key: string, socket: WebSocket): void {
    const sockets = this.map.get(key);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.map.delete(key);
  }

  get(key: string): ReadonlySet<WebSocket> {
    return this.map.get(key) ?? new Set();
  }
}

/**
 * Open sockets of this gateway instance, indexed by user and login session,
 * plus the heartbeat that removes dead ones. A user may have several sockets
 * (tabs). There are no rooms: events from chat-service name their recipients
 * (`recipientUserIds`), so this gateway never needs to know who belongs to
 * which conversation. Each instance receives every event on its own queue
 * and delivers to the sockets it holds.
 */
@Injectable()
export class ConnectionRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionRegistry.name);
  private readonly connections = new Map<WebSocket, ConnectionInfo>();
  private readonly byUser = new SocketIndex();
  private readonly bySession = new SocketIndex();
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get size(): number {
    return this.connections.size;
  }

  /** Sizes of every index: all zero once every socket is gone (no leak). */
  stats(): { sockets: number; users: number; sessions: number } {
    return {
      sockets: this.connections.size,
      users: this.byUser.size,
      sessions: this.bySession.size,
    };
  }

  onModuleInit(): void {
    const intervalMs = this.config.get('WS_HEARTBEAT_MS', { infer: true });
    this.heartbeat = setInterval(() => this.checkHeartbeats(), intervalMs);
    this.heartbeat.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.heartbeat);
    await Promise.all(
      [...this.connections.keys()].map((socket) => {
        const closed = waitForClose(socket, SHUTDOWN_GRACE_MS);
        socket.close(CLOSE_GOING_AWAY, 'Server shutting down');
        return closed;
      }),
    );
  }

  add(socket: WebSocket, owner: SocketOwner): ConnectionInfo {
    const info: ConnectionInfo = {
      userId: owner.userId,
      sid: owner.sid,
      connectedAt: new Date(),
      isAlive: true,
    };
    this.connections.set(socket, info);
    this.byUser.add(info.userId, socket);
    this.bySession.add(info.sid, socket);
    socket.on('pong', () => {
      info.isAlive = true;
    });
    return info;
  }

  get(socket: WebSocket): ConnectionInfo | undefined {
    return this.connections.get(socket);
  }

  /** Unregisters a socket from every index. */
  remove(socket: WebSocket): ConnectionInfo | undefined {
    const info = this.connections.get(socket);
    if (!info) return undefined;
    this.connections.delete(socket);
    this.byUser.delete(info.userId, socket);
    this.bySession.delete(info.sid, socket);
    return info;
  }

  send(socket: WebSocket, envelope: ServerEnvelope): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(envelope));
    }
  }

  /**
   * One frame to every open socket (on this instance) of these users;
   * returns how many sockets got it.
   */
  sendToUsers(userIds: Iterable<string>, envelope: ServerEnvelope): number {
    const sockets = new Set<WebSocket>();
    for (const userId of userIds) {
      for (const socket of this.byUser.get(userId)) sockets.add(socket);
    }
    return this.sendToAll(sockets, envelope);
  }

  /** Closes every socket of a login session; returns the count. */
  closeSession(sid: string, code: number, reason: string): number {
    const sockets = [...this.bySession.get(sid)];
    for (const socket of sockets) socket.close(code, reason);
    return sockets.length;
  }

  private sendToAll(
    sockets: Iterable<WebSocket>,
    envelope: ServerEnvelope,
  ): number {
    const frame = JSON.stringify(envelope);
    let delivered = 0;
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
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
        this.logger.warn(
          `Terminating unresponsive socket of user ${info.userId}`,
        );
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
