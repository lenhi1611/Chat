import { Inject, Injectable } from '@nestjs/common';
import type { UserSummary } from '@realtime-chat/contracts';
import { ChatPrismaService } from './prisma/chat-prisma.service';
import { USER_SOURCE, type UserSource } from './user-source.port';

/**
 * The users chat needs (member names), from its own table `chat_users`
 * (event-carried state transfer: `auth.user.registered` fills it), with
 * read-through: ids it does not have are fetched from the user source once,
 * stored, then served locally. So chat keeps working while auth-service is
 * down, except for users it has never seen.
 */
@Injectable()
export class UserDirectory {
  constructor(
    private readonly prisma: ChatPrismaService,
    @Inject(USER_SOURCE) private readonly source: UserSource,
  ) {}

  /** Known users among `ids`, in one local query (+ one remote lookup for the missing). */
  async findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const local = await this.prisma.chatUser.findMany({
      where: { id: { in: wanted } },
      select: { id: true, username: true, displayName: true },
    });
    if (local.length === wanted.length) return local;

    const have = new Set(local.map((user) => user.id));
    const missing = wanted.filter((id) => !have.has(id));
    const fetched = await this.source.findSummariesByIds(missing);
    await Promise.all(fetched.map((user) => this.upsert(user)));
    return [...local, ...fetched];
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findSummariesByIds([id])).length === 1;
  }

  /** From an `auth.user.registered` event (or a read-through). Idempotent. */
  async upsert(user: UserSummary): Promise<void> {
    const data = {
      username: user.username,
      displayName: user.displayName,
      syncedAt: new Date(),
    };
    await this.prisma.chatUser.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
  }
}
