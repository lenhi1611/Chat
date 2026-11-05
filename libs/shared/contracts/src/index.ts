// Framework-agnostic contracts shared by Angular apps and NestJS services.
// Keep this library free of Angular, NestJS and Node-specific imports.
export * from './lib/http/api-paths';
export type * from './lib/http/health';

// REST API (phase 2)
export * from './lib/http/limits';
export * from './lib/http/errors';
export * from './lib/http/users';
export * from './lib/http/auth';
export * from './lib/http/conversations';

// WebSocket protocol (phase 1)
export * from './lib/ws/ws.constants';
export * from './lib/ws/ws.schemas';
export * from './lib/ws/ws.envelope';
