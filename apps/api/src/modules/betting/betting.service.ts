import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { walletService } from '../wallet/wallet.service.js';
import { decimalToString, parseAmount } from '../../lib/utils.js';

export class BettingService {
  async placeBet(input: {
    userId: string;
    gameId: string;
    sessionId?: string;
    roomId?: string;
    amount: number;
    selection?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const amount = parseAmount(input.amount);
    if (amount <= 0) throw new ValidationError('Bet amount must be positive');

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game || game.status !== 'ACTIVE') {
      throw new NotFoundError('Game not available for betting');
    }

    const walletTx = await walletService.gameDebit(
      input.userId,
      amount,
      input.sessionId ?? 'pending',
      undefined,
      input.idempotencyKey ? `${input.idempotencyKey}-debit` : undefined,
    );

    const bet = await prisma.bet.create({
      data: {
        gameId: input.gameId,
        sessionId: input.sessionId,
        roomId: input.roomId,
        userId: input.userId,
        amount,
        status: 'ACCEPTED',
        selection: (input.selection ?? {}) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        metadata: { walletTransactionId: walletTx.transactionId } as Prisma.InputJsonValue,
        participants: {
          create: {
            userId: input.userId,
            amount,
            share: 1,
          },
        },
      },
    });

    return {
      betId: bet.id,
      status: bet.status,
      amount: decimalToString(bet.amount),
      walletTransactionId: walletTx.transactionId,
    };
  }

  async settleBet(
    betId: string,
    outcome: 'WON' | 'LOST' | 'PUSH' | 'REFUNDED',
    payout?: number,
    idempotencyKey?: string,
  ) {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { participants: true },
    });

    if (!bet) throw new NotFoundError('Bet not found');
    if (['SETTLED', 'CANCELLED'].includes(bet.status)) {
      throw new ValidationError('Bet already settled');
    }

    const statusMap = { WON: 'WON', LOST: 'LOST', PUSH: 'PUSH', REFUNDED: 'REFUNDED' } as const;

    if (outcome === 'WON' && payout && payout > 0) {
      await walletService.gameCredit(
        bet.userId,
        payout,
        bet.sessionId ?? bet.id,
        bet.id,
        idempotencyKey ? `${idempotencyKey}-credit` : undefined,
      );
    } else if (outcome === 'REFUNDED' || outcome === 'PUSH') {
      await walletService.refund(
        bet.userId,
        parseAmount(bet.amount.toString()),
        {
          referenceType: 'bet',
          referenceId: bet.id,
          idempotencyKey: idempotencyKey ? `${idempotencyKey}-refund` : undefined,
        },
      );
    }

    const updated = await prisma.bet.update({
      where: { id: betId },
      data: {
        status: statusMap[outcome],
        payout: payout ?? null,
        settledAt: new Date(),
      },
    });

    return {
      betId: updated.id,
      status: updated.status,
      payout: updated.payout ? decimalToString(updated.payout) : null,
    };
  }

  async getUserBets(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.bet.findMany({
        where: { userId },
        include: { game: { select: { slug: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.bet.count({ where: { userId } }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        game: b.game,
        amount: decimalToString(b.amount),
        status: b.status,
        payout: b.payout ? decimalToString(b.payout) : null,
        createdAt: b.createdAt.toISOString(),
        settledAt: b.settledAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async adminList(page = 1, pageSize = 20, filters?: { status?: string; gameId?: string; userId?: string }) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.BetWhereInput = {};
    if (filters?.status) where.status = filters.status as Prisma.EnumBetStatusFilter;
    if (filters?.gameId) where.gameId = filters.gameId;
    if (filters?.userId) where.userId = filters.userId;

    const [items, total] = await Promise.all([
      prisma.bet.findMany({
        where,
        include: {
          game: { select: { slug: true, name: true } },
          room: { select: { code: true, name: true } },
          session: { select: { id: true, roundNumber: true, isTestMode: true } },
          participants: { include: { user: { select: { id: true, username: true, email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.bet.count({ where }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        userId: b.userId,
        user: b.participants[0]?.user ?? null,
        game: b.game,
        room: b.room,
        session: b.session,
        amount: decimalToString(b.amount),
        currency: b.currency,
        status: b.status,
        selection: b.selection,
        payout: b.payout ? decimalToString(b.payout) : null,
        result: b.metadata,
        createdAt: b.createdAt.toISOString(),
        settledAt: b.settledAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }
}

export const bettingService = new BettingService();
