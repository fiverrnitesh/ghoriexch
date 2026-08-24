import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../lib/errors.js';
import type { RoleName } from '@games/shared';

const SALT_ROUNDS = 12;

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AccountSettingsInput {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  marketingEmails?: boolean;
  hideBalance?: boolean;
}

export class ProfileService {
  async getAccount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        wallet: { select: { currency: true } },
      },
    });

    if (!user) throw new NotFoundError('User not found');

    const roles = user.roles.map((r) => r.role.name as RoleName);
    const preferences = (user.preferences as Record<string, unknown>) ?? {};

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles,
      currency: user.wallet?.currency ?? 'USD',
      preferences: {
        emailNotifications: preferences.emailNotifications ?? true,
        pushNotifications: preferences.pushNotifications ?? true,
        marketingEmails: preferences.marketingEmails ?? false,
        hideBalance: preferences.hideBalance ?? false,
      },
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    if (input.displayName !== undefined) {
      const trimmed = input.displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 50) {
        throw new ValidationError('Display name must be 1–50 characters');
      }
    }

    if (input.avatarUrl !== undefined && input.avatarUrl !== null) {
      try {
        const url = new URL(input.avatarUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new ValidationError('Avatar URL must be http or https');
        }
      } catch {
        throw new ValidationError('Invalid avatar URL');
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined && { displayName: input.displayName.trim() }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      },
    });

    return this.getAccount(userId);
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    if (input.newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true };
  }

  async updateSettings(userId: string, input: AccountSettingsInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const current = (user.preferences as Record<string, unknown>) ?? {};
    const merged = { ...current, ...input };

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as Prisma.InputJsonValue },
    });

    return this.getAccount(userId);
  }
}

export const profileService = new ProfileService();
