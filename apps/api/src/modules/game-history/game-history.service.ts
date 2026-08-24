import type { BetStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { decimalToString } from '../../lib/utils.js';

export interface GameHistoryFilters {
  page?: number;
  pageSize?: number;
  gameSlug?: string;
  status?: BetStatus;
  from?: Date;
  to?: Date;
}

/** Generic game history — works for any game via Bet + Game catalog */
export class GameHistoryService {
  async listForUser(userId: string, filters: GameHistoryFilters = {}) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.BetWhereInput = { userId };

    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    if (filters.gameSlug) {
      where.game = { slug: filters.gameSlug };
    }

    const [items, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: {
          game: { select: { id: true, slug: true, name: true, category: true } },
          session: { select: { id: true, roundNumber: true } },
          room: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.bet.count({ where }),
    ]);

    return {
      items: items.map((bet) => ({
        id: bet.id,
        game: {
          id: bet.game.id,
          slug: bet.game.slug,
          name: bet.game.name,
          category: bet.game.category,
        },
        sessionId: bet.sessionId,
        roundNumber: bet.session?.roundNumber ?? null,
        room: bet.room ? { id: bet.room.id, code: bet.room.code, name: bet.room.name } : null,
        amount: decimalToString(bet.amount),
        payout: bet.payout ? decimalToString(bet.payout) : null,
        status: bet.status,
        selection: bet.selection as Record<string, unknown> | null,
        metadata: bet.metadata as Record<string, unknown> | null,
        createdAt: bet.createdAt.toISOString(),
        settledAt: bet.settledAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getSummary(userId: string) {
    const [totalBets, wins, losses, totalWagered] = await Promise.all([
      prisma.bet.count({ where: { userId } }),
      prisma.bet.count({ where: { userId, status: { in: ['WON', 'SETTLED'] } } }),
      prisma.bet.count({ where: { userId, status: 'LOST' } }),
      prisma.bet.aggregate({
        where: { userId, status: { not: 'CANCELLED' } },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalBets,
      wins,
      losses,
      totalWagered: totalWagered._sum.amount?.toString() ?? '0',
    };
  }
}

export const gameHistoryService = new GameHistoryService();
