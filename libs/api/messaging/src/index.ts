// Public API of @realtime-chat/api-messaging: RabbitMQ for the backend apps.
export {
  MESSAGING_OPTIONS,
  MessagingModule,
  rpcClientProvider,
  withDefaults,
  type MessagingModuleAsyncOptions,
  type MessagingModuleOptions,
  type ResolvedMessagingOptions,
} from './lib/messaging.module';
export {
  MessagingConnection,
  reconnectDelayMs,
  type MessagingConnectionOptions,
  type PublishMeta,
} from './lib/connection';
export {
  EVENT_PUBLISHER,
  type EventPublisher,
} from './lib/event-publisher.port';
export { AmqpEventPublisher, CommandPublisher } from './lib/publishers';
export {
  correlationIdOf,
  createRpcClient,
  handleRpc,
  RpcClient,
  rpcServerOptions,
  toRpcError,
  type RpcClientSettings,
} from './lib/rpc';
export {
  commandServerOptions,
  consumeCommand,
  consumeEvent,
  eventServerOptions,
  InflightTracker,
  PermanentCommandError,
  type CommandConsumerDeps,
  type EventConsumerDeps,
} from './lib/consumers';
export {
  declareTopology,
  defaultTopology,
  deliveryAttempt,
  EXCHANGE_OPTIONS,
  INSTANCE_QUEUE_OPTIONS,
  queueOptions,
  topologyNames,
  type QueueKey,
  type TopologyNames,
  type TopologySettings,
} from './lib/topology';
