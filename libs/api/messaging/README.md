# api-messaging

RabbitMQ plumbing shared by the api-gateway, auth-service and chat-service:
topology (one source of queue arguments), connection with reconnect, RPC
client/server helpers, event and command publishers, consumers with manual
ack and retry / dead-letter.

Integration tests need RabbitMQ (`npm run infra:up`); they use their own
randomly prefixed exchange and queues and delete them afterwards.
