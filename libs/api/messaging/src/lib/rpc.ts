import type { Logger } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type RmqContext,
  RmqRecordBuilder,
  RpcException,
  type RmqOptions,
  Transport,
} from '@nestjs/microservices';
import {
  AppError,
  isRpcError,
  MESSAGING_HEADERS,
  RPC_CONTRACTS,
  type RpcError,
  type RpcPattern,
  type RpcRequest,
  type RpcRequestParsed,
  type RpcResponse,
  type ValidationIssue,
} from '@realtime-chat/contracts';
import { lastValueFrom, timeout, TimeoutError } from 'rxjs';
import type { z } from 'zod';
import { queueOptions, type QueueKey, type TopologySettings } from './topology';

// --- client --------------------------------------------------------------------

/**
 * Request–reply over RabbitMQ (Nest's RMQ transport, direct reply-to).
 *
 * - Every request expires after the timeout (`expiration`): if no service
 *   took it by then, the broker drops it, so a service that comes back later
 *   never handles a request whose caller has given up (no "ghost" request).
 * - Timeout, no consumer, broker unreachable → AppError SERVICE_UNAVAILABLE.
 * - A domain error from the service comes back as the same AppError code.
 * - The reply is validated against the contract.
 */
export class RpcClient {
  constructor(
    private readonly proxy: ClientProxy,
    private readonly service: string,
    private readonly timeoutMs: number,
  ) {}

  async call<P extends RpcPattern>(
    pattern: P,
    data: RpcRequest<P>,
    correlationId: string,
  ): Promise<RpcResponse<P>> {
    const record = new RmqRecordBuilder(data)
      .setOptions({
        expiration: String(this.timeoutMs),
        persistent: false,
        headers: { [MESSAGING_HEADERS.correlationId]: correlationId },
      })
      .build();
    let reply: unknown;
    try {
      reply = await lastValueFrom(
        this.proxy.send(pattern, record).pipe(timeout(this.timeoutMs)),
      );
    } catch (error) {
      throw toAppError(error, this.service);
    }
    const parsed = (RPC_CONTRACTS[pattern].response as z.ZodType).safeParse(
      reply,
    );
    if (!parsed.success) {
      throw new AppError(
        'INTERNAL_ERROR',
        `Invalid reply from ${this.service} to ${pattern}`,
      );
    }
    return parsed.data as RpcResponse<P>;
  }

  /**
   * Opens the connection now instead of on the first call (whose timeout
   * would otherwise include connecting). Waits while RabbitMQ is down: do not
   * await it during bootstrap.
   */
  async connect(): Promise<void> {
    await this.proxy.connect();
  }

  close(): Promise<void> {
    return Promise.resolve(this.proxy.close()).then(() => undefined);
  }

  /** Nest calls it on app shutdown when the client is a provider. */
  onApplicationShutdown(): Promise<void> {
    return this.close();
  }
}

function toAppError(error: unknown, service: string): AppError {
  if (isRpcError(error)) {
    return new AppError(error.code, error.message, error.details);
  }
  if (error instanceof TimeoutError) {
    return new AppError(
      'SERVICE_UNAVAILABLE',
      `The ${service} service did not answer in time`,
    );
  }
  // Anything else (connection refused, an unexpected reply) is the
  // transport failing, not the service saying no.
  return new AppError(
    'SERVICE_UNAVAILABLE',
    `The ${service} service is unavailable`,
  );
}

export interface RpcClientSettings {
  url: string;
  topology: TopologySettings;
  timeoutMs: number;
}

/** A client for the service consuming `queue` (asserted with the shared arguments). */
export function createRpcClient(
  { url, topology, timeoutMs }: RpcClientSettings,
  queue: Extract<QueueKey, 'authRpc' | 'chatRpc'>,
): RpcClient {
  const proxy = ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue: topology.names[queue],
      queueOptions: queueOptions(topology, queue),
      persistent: false,
      socketOptions: { reconnectTimeInSeconds: 1 },
    },
  });
  return new RpcClient(proxy, queue === 'authRpc' ? 'auth' : 'chat', timeoutMs);
}

// --- server --------------------------------------------------------------------

/** Options for `app.connectMicroservice()` of a service answering RPCs. */
export function rpcServerOptions(
  url: string,
  topology: TopologySettings,
  queue: Extract<QueueKey, 'authRpc' | 'chatRpc'>,
): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue: topology.names[queue],
      queueOptions: queueOptions(topology, queue),
      // A request lost with a crashing service is answered by the caller's
      // timeout; replaying it later would be a ghost request anyway.
      noAck: true,
      prefetchCount: 20,
      socketOptions: { reconnectTimeInSeconds: 1 },
    },
  };
}

/** The correlation id the caller put on the message (or a new one). */
export function correlationIdOf(context: RmqContext): string {
  const message = context.getMessage() as
    { properties?: { headers?: Record<string, unknown> } } | undefined;
  const value = message?.properties?.headers?.[MESSAGING_HEADERS.correlationId];
  return typeof value === 'string' && value ? value : crypto.randomUUID();
}

/**
 * Runs an RPC handler: validates the request against the contract, then
 * turns whatever it throws into an RpcError the caller maps back:
 * an AppError keeps its code; anything else is logged and becomes
 * INTERNAL_ERROR (no internals leak to the caller).
 */
export async function handleRpc<P extends RpcPattern>(
  pattern: P,
  raw: unknown,
  context: RmqContext,
  logger: Logger,
  handler: (
    request: RpcRequestParsed<P>,
    meta: { correlationId: string },
  ) => Promise<RpcResponse<P>>,
): Promise<RpcResponse<P>> {
  const correlationId = correlationIdOf(context);
  const parsed = (RPC_CONTRACTS[pattern].request as z.ZodType).safeParse(raw);
  if (!parsed.success) {
    throw new RpcException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid request',
      details: issuesOf(parsed.error),
    } satisfies RpcError);
  }
  try {
    return await handler(parsed.data as RpcRequestParsed<P>, { correlationId });
  } catch (error) {
    throw new RpcException(toRpcError(error, logger, pattern, correlationId));
  }
}

export function toRpcError(
  error: unknown,
  logger: Logger,
  pattern: string,
  correlationId: string,
): RpcError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    };
  }
  logger.error(
    `${pattern} failed [correlationId=${correlationId}]: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

function issuesOf(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
