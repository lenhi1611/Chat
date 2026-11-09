export type ServiceHealth = 'up' | 'down';

/**
 * Response body of `GET /api/health`: 200 with `status: 'ok'` when every
 * backend part answers, 503 with `status: 'degraded'` otherwise.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  services: {
    auth: ServiceHealth;
    chat: ServiceHealth;
    rabbitmq: ServiceHealth;
  };
}
