import type { UserSummary } from '@realtime-chat/contracts';
import type { UserSource } from '../lib/user-source.port';

/** In-memory users standing in for auth-service (the read-through source). */
export class FakeUserSource implements UserSource {
  private readonly users = new Map<string, UserSummary>();
  /** Remote lookups made, to check the local copy is used once filled. */
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
}
