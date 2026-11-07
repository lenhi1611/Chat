import type { UserSummary } from '@realtime-chat/contracts';
import type { UsersPort } from '../lib/users.port';

/** In-memory users for chat tests (the real port reads auth_db). */
export class FakeUsersPort implements UsersPort {
  private readonly users = new Map<string, UserSummary>();
  /** Calls to findSummariesByIds, to check users are fetched in one lookup. */
  lookups = 0;

  add(username: string): UserSummary {
    const user = {
      id: crypto.randomUUID(),
      username,
      displayName: username.toUpperCase(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    this.lookups += 1;
    return [...new Set(ids)].flatMap((id) => this.users.get(id) ?? []);
  }

  async exists(id: string): Promise<boolean> {
    return this.users.has(id);
  }
}
