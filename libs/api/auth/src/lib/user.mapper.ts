import type { CurrentUser, UserSummary } from '@realtime-chat/contracts';
import type { User } from '../generated/prisma/client';

export const toUserSummary = (user: User): UserSummary => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
});

export const toCurrentUser = (user: User): CurrentUser => ({
  ...toUserSummary(user),
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});
