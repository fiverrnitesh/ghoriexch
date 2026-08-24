import { prisma } from '../../database/client.js';
import { env } from '../../config/env.js';
import { decimalToString } from '../../lib/utils.js';

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

export class AdminDashboardService {
  async getStats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

    const [
      totalUsers,
      activeUsers,
      onlineUsers,
      totalGames,
      activeRooms,
      activeSessions,
      totalBets,
      betsLast24h,
      txVolume,
      pendingWithdrawals,
      pendingDeposits,
      totalBalance,
      recentAudit,
      recentTransactions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { lastLoginAt: { gte: onlineSince } } }),
      prisma.game.count(),
      prisma.room.count({ where: { status: { in: ['OPEN', 'IN_GAME', 'FULL'] } } }),
      prisma.gameSession.count({ where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } } }),
      prisma.bet.count(),
      prisma.bet.count({ where: { createdAt: { gte: since24h } } }),
      prisma.walletTransaction.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: since24h } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.walletTransaction.count({ where: { type: 'DEPOSIT', status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.adminAuditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { username: true } } },
      }),
      prisma.walletTransaction.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { wallet: { include: { user: { select: { username: true } } } } },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      onlineUsers,
      totalGames,
      activeRooms,
      activeSessions,
      totalBets,
      betsLast24h,
      transactionVolume24h: txVolume._sum.amount?.toString() ?? '0',
      pendingWithdrawals,
      pendingDeposits,
      totalPlatformBalance: totalBalance._sum.balance?.toString() ?? '0',
      sandboxMode: env.wallet.sandboxMode,
      adminTestModeEnabled: env.admin.testModeEnabled,
      recentActivity: [
        ...recentAudit.map((log) => ({
          id: log.id,
          type: 'audit' as const,
          action: log.action,
          actor: log.actor.username,
          targetType: log.targetType,
          targetId: log.targetId,
          timestamp: log.createdAt.toISOString(),
        })),
        ...recentTransactions.map((tx) => ({
          id: tx.id,
          type: 'transaction' as const,
          action: tx.type,
          actor: tx.wallet.user.username,
          targetType: 'wallet_transaction',
          targetId: tx.id,
          amount: decimalToString(tx.amount),
          status: tx.status,
          timestamp: tx.createdAt.toISOString(),
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 12),
    };
  }
}

export const adminDashboardService = new AdminDashboardService();
