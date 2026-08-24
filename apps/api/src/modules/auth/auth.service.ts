import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { signToken } from '../../middleware/auth.js';
import type { RoleName } from '@games/shared';

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
    });

    if (existing) {
      throw new ConflictError('Email or username already in use');
    }

    const userRole = await prisma.role.findUniqueOrThrow({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        passwordHash,
        displayName: input.displayName ?? input.username,
        roles: { create: [{ roleId: userRole.id }] },
        wallet: {
          create: {
            balance: 0,
            availableBalance: 0,
            lockedBalance: 0,
            currency: 'USD',
          },
        },
      },
      include: {
        roles: { include: { role: true } },
        wallet: true,
      },
    });

    const roles = user.roles.map((r) => r.role.name as RoleName);
    const token = signToken({ userId: user.id, email: user.email, roles });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.formatUser(user, roles), token };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { roles: { include: { role: true } }, wallet: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is not active');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const roles = user.roles.map((r) => r.role.name as RoleName);
    const token = signToken({ userId: user.id, email: user.email, roles });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user: this.formatUser(user, roles), token };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new NotFoundError('User not found');

    const roles = user.roles.map((r) => r.role.name as RoleName);
    return this.formatProfile(user, roles);
  }

  private formatUser(
    user: Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>,
    roles: RoleName[],
  ) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      roles,
    };
  }

  private formatProfile(
    user: Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>,
    roles: RoleName[],
  ) {
    return {
      ...this.formatUser(user, roles),
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}

export const authService = new AuthService();
