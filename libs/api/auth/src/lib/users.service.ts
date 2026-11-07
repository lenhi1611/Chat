import { Injectable } from '@nestjs/common';
import {
  AppError,
  USER_SEARCH_MAX_RESULTS,
  type UserSummary,
} from '@realtime-chat/contracts';
import { Prisma, type User } from '../generated/prisma/client';
import { AuthPrismaService } from './prisma/auth-prisma.service';
import { toUserSummary } from './user.mapper';

export interface NewUser {
  /** Already normalised (lowercase), as the contracts schema outputs it. */
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

/**
 * Prisma's `startsWith` becomes `LIKE 'prefix%'` without escaping, and
 * usernames may contain `_` (a LIKE wildcard): escape it, `%` and `\`.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/** Users of auth_db. Other domains reach it only through an adapter port. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: AuthPrismaService) {}

  /** @throws AppError EMAIL_TAKEN or USERNAME_TAKEN */
  async create(data: NewUser): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Which unique constraint failed? Ask the table rather than parse
        // driver-specific error metadata. (Also right when two registrations
        // race: the loser sees the winner's row.)
        const emailTaken = await this.prisma.user.findUnique({
          where: { email: data.email },
          select: { id: true },
        });
        throw emailTaken
          ? new AppError('EMAIL_TAKEN', 'This email is already registered')
          : new AppError('USERNAME_TAKEN', 'This username is already taken');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Users whose username starts with `prefix` (already lowercased), minus `excludeId`. */
  async searchByUsernamePrefix(
    prefix: string,
    excludeId: string,
  ): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: {
        username: { startsWith: escapeLike(prefix) },
        id: { not: excludeId },
      },
      orderBy: { username: 'asc' },
      take: USER_SEARCH_MAX_RESULTS,
    });
    return users.map(toUserSummary);
  }

  /** One query for any number of ids; unknown ids are simply absent. */
  async findSummariesByIds(ids: readonly string[]): Promise<UserSummary[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    return users.map(toUserSummary);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id } })) > 0;
  }
}
