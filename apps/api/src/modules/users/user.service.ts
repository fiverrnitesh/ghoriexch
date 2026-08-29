import { prisma } from '../../database/client.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { auditService } from '../audit/audit.service.js';
import type { UserStatus, Prisma } from '@prisma/client';
import type { RoleName } from '@games/shared';

export class UserService {
  async adminList(page = 1, pageSize = 20, status?: UserStatus, search?: string) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.UserWhereInput = {};
    if (status) where.status = status;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ];
      if (q.length > 8) where.OR.push({ id: q });
    }
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          roles: { include: { role: true } },
          parent: { select: { id: true, username: true, displayName: true } },
          wallet: { select: { balance: true, availableBalance: true, lockedBalance: true, currency: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        status: u.status,
        roles: u.roles.map((r) => r.role.name),
        parent: u.parent,
        wallet: u.wallet,
        isUnlimited: u.isUnlimited,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async updateStatus(userId: string, status: UserStatus, actorId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const updated = await prisma.user.update({ where: { id: userId }, data: { status } });

    await auditService.log({
      actorId,
      action: status === 'SUSPENDED' ? 'USER_SUSPEND' : status === 'BANNED' ? 'USER_BAN' : 'USER_UPDATE',
      targetType: 'user',
      targetId: userId,
      before: { status: user.status },
      after: { status },
    });

    return updated;
  }

  async assignRole(userId: string, roleName: RoleName, actorId: string) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundError('Role not found');

    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    if (existing) throw new ConflictError('User already has this role');

    await prisma.userRole.create({ data: { userId, roleId: role.id, grantedBy: actorId } });

    await auditService.log({
      actorId,
      action: 'ROLE_ASSIGN',
      targetType: 'user',
      targetId: userId,
      after: { role: roleName },
    });
  }

  async adminWalletOverview(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.wallet.findMany({
        include: { user: { select: { id: true, username: true, email: true, status: true } } },
        orderBy: { balance: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.wallet.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async adminTransactions(page = 1, pageSize = 20, filters?: { type?: string; status?: string; userId?: string }) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.WalletTransactionWhereInput = {};
    if (filters?.type) where.type = filters.type as Prisma.EnumWalletTransactionTypeFilter;
    if (filters?.status) where.status = filters.status as Prisma.EnumWalletTransactionStatusFilter;
    if (filters?.userId) where.wallet = { userId: filters.userId };

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        include: { wallet: { include: { user: { select: { id: true, username: true, email: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.walletTransaction.count({ where }),
    ]);
    return {
      items: items.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.toString(),
        balanceAfter: tx.balanceAfter.toString(),
        description: tx.description,
        referenceType: tx.referenceType,
        referenceId: tx.referenceId,
        user: tx.wallet.user,
        createdAt: tx.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        parent: { select: { id: true, username: true, displayName: true } },
        _count: { select: { downlines: true } },
        wallet: true,
      },
    });
    if (!user) throw new NotFoundError('User not found');

    const preferences = (user.preferences as Record<string, unknown>) ?? {};

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles: user.roles.map((r) => r.role.name),
      parent: user.parent,
      downlineCount: user._count.downlines,
      isUnlimited: user.isUnlimited,
      preferences: {
        emailNotifications: preferences.emailNotifications ?? true,
        pushNotifications: preferences.pushNotifications ?? true,
        marketingEmails: preferences.marketingEmails ?? false,
        hideBalance: preferences.hideBalance ?? false,
      },
      wallet: user.wallet
        ? {
            id: user.wallet.id,
            currency: user.wallet.currency,
            balance: user.wallet.balance.toString(),
            availableBalance: user.wallet.availableBalance.toString(),
            lockedBalance: user.wallet.lockedBalance.toString(),
          }
        : null,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  async getUserTransactions(userId: string, page = 1, pageSize = 20) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { items: [], total: 0, page, pageSize };

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      items: items.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.toString(),
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getUserActiveSessions(userId: string) {
    const players = await prisma.gamePlayer.findMany({
      where: { userId, status: { not: 'LEFT' } },
      include: {
        session: {
          include: {
            game: { select: { slug: true, name: true } },
            room: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    });

    return players
      .filter((p) => ['WAITING', 'IN_PROGRESS', 'SETTLING'].includes(p.session.status))
      .map((p) => ({
        sessionId: p.session.id,
        status: p.session.status,
        isTestMode: p.session.isTestMode,
        roundNumber: p.session.roundNumber,
        game: p.session.game,
        room: p.session.room,
        playerStatus: p.status,
        joinedAt: p.joinedAt.toISOString(),
      }));
  }

  async updateUserSettings(userId: string, settings: Record<string, unknown>, actorId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const current = (user.preferences as Record<string, unknown>) ?? {};
    const merged = { ...current, ...settings };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as Prisma.InputJsonValue },
    });

    await auditService.log({
      actorId,
      action: 'USER_UPDATE',
      targetType: 'user',
      targetId: userId,
      before: { preferences: current },
      after: { preferences: merged },
    });

    return updated;
  }
}

export const userService = new UserService();
