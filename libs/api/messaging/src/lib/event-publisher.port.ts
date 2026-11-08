import type { DomainEvent } from '@realtime-chat/contracts';

/**
 * How a domain library announces that something happened, without knowing
 * about RabbitMQ. The app provides the implementation (AmqpEventPublisher).
 *
 * `publish` resolves once the broker has taken the event; it rejects
 * (AppError SERVICE_UNAVAILABLE) otherwise. Never swallow that error.
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

/** Inject with `@Inject(EVENT_PUBLISHER) events: EventPublisher`. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
