import type { User } from '@prisma/client';

export interface ProfileDto {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export function toProfileDto(user: User): ProfileDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarKey ? `/users/avatars/${user.avatarKey}` : null,
    createdAt: user.createdAt,
  };
}
