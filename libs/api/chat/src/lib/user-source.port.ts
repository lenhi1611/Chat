import type { UserSummary } from '@realtime-chat/contracts';

/**
 * Where the chat domain asks about users it has never seen (users live in
 * auth_db). Implemented by the app: chat-service calls auth-service
 * (`auth.users.summaries`); the api-gateway, while it still runs this library
 * in-process, reads the auth library directly.
 */
export interface UserSource {
  /** One lookup for any number of ids; unknown ids are absent from the result. */
  findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]>;
}

export const USER_SOURCE = Symbol('USER_SOURCE');
