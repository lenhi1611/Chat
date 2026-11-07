import type { UserSummary } from '@realtime-chat/contracts';

/**
 * What the chat domain needs to know about users, which live in another
 * domain (auth_db). Implemented by the app: today an adapter over the auth
 * UsersService, after the split (phase 3) a call to auth-service.
 */
export interface UsersPort {
  /** One lookup for any number of ids; unknown ids are absent from the result. */
  findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]>;
  exists(id: string): Promise<boolean>;
}

export const USERS_PORT = Symbol('USERS_PORT');
