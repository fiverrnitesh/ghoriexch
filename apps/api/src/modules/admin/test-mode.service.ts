import type { Prisma } from '@prisma/client';
import { DICE_ACTIONS } from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { auditService } from '../audit/audit.service.js';
import { walletService } from '../wallet/wallet.service.js';
import { bettingService } from '../betting/betting.service.js';
import { decimalToString, parseAmount } from '../../lib/utils.js';

export type TestOutcome = 'WIN' | 'LOSS' | 'PUSH' | 'BLANK' | 'REFUND';

export class TestModeService {
  private assertTestModeEnabled() {
    if (!env.admin.testModeEnabled) {
      throw new ForbiddenError('Admin test mode is disabled. Set ADMIN_TEST_MODE=true in development only.');
    }
    if (env.isProd) {
      throw new ForbiddenError('Admin test mode is not available in production');
    }
  }

  private async assertTestSession(sessionId: string) {
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session not found');
    if (!session.isTestMode) {
      throw new ForbiddenError('Session is not marked as TEST/SANDBOX. Test controls are only available on test sessions.');
    }
    return session;
  }

  async createTestSession(gameSlug: string, hostUserId: string, actorId: string) {
    this.assertTestModeEnabled();

    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game) throw new NotFoundError('Game not found');

    const session = await prisma.gameSession.create({
      data: {
        gameId: game.id,
        status: 'WAITING',
        isTestMode: true,
        state: { testMode: true, environment: 'SANDBOX' } as Prisma.InputJsonValue,
        serverSeedHash: 'test-mode',
        serverSeed: 'test-mode-seed',
      },
    });

    await prisma.gamePlayer.create({
      data: { sessionId: session.id, userId: hostUserId, status: 'JOINED', seatIndex: 0 },
    });

    await auditService.log({
      actorId,
      action: 'TEST_SESSION_CONTROL',
      targetType: 'game_session',
      targetId: session.id,
      after: { isTestMode: true, gameSlug },
      metadata: { operation: 'create_test_session' },
    });

    return { sessionId: session.id, isTestMode: true, gameSlug, status: session.status };
  }

  async forceResult(sessionId: string, result: Record<string, unknown>, actorId: string) {
    this.assertTestModeEnabled();
    await this.assertTestSession(sessionId);

    const session = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        result: result as Prisma.InputJsonValue,
        status: 'SETTLING',
      },
    });

    await auditService.log({
      actorId,
      action: 'TEST_SESSION_CONTROL',
      targetType: 'game_session',
      targetId: sessionId,
      after: { result },
      metadata: { operation: 'force_result' },
    });

    return { sessionId, result: session.result, status: session.status };
  }

  async simulateOutcome(
    sessionId: string,
    betId: string,
    outcome: TestOutcome,
    actorId: string,
    payout?: number,
  ) {
    this.assertTestModeEnabled();
    await this.assertTestSession(sessionId);

    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { session: true },
    });
    if (!bet) throw new NotFoundError('Bet not found');
    if (bet.sessionId !== sessionId) throw new ValidationError('Bet does not belong to this session');
    if (!bet.session?.isTestMode) throw new ForbiddenError('Bet session is not in test mode');

    let settlementOutcome: 'WON' | 'LOST' | 'PUSH' | 'REFUNDED';
    let settlementPayout: number | undefined;

    switch (outcome) {
      case 'WIN':
        settlementOutcome = 'WON';
        settlementPayout = payout ?? parseAmount(bet.amount.toString()) * 2;
        break;
      case 'LOSS':
        settlementOutcome = 'LOST';
        break;
      case 'PUSH':
        settlementOutcome = 'PUSH';
        break;
      case 'BLANK':
        settlementOutcome = 'LOST';
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: { result: { dice: [], blank: true } as Prisma.InputJsonValue },
        });
        break;
      case 'REFUND':
        settlementOutcome = 'REFUNDED';
        break;
      default:
        throw new ValidationError('Invalid test outcome');
    }

    const result = await bettingService.settleBet(
      betId,
      settlementOutcome,
      settlementPayout,
      `test-${betId}-${outcome}`,
    );

    await auditService.log({
      actorId,
      action: 'TEST_SESSION_CONTROL',
      targetType: 'bet',
      targetId: betId,
      before: { status: bet.status, amount: decimalToString(bet.amount) },
      after: { outcome, settlement: result },
      metadata: { operation: 'simulate_outcome', sessionId, testMode: true },
    });

    return { ...result, testMode: true, outcome };
  }

  async testWalletAdjust(
    userId: string,
    operation: 'credit' | 'debit',
    amount: number,
    actorId: string,
    note?: string,
  ) {
    this.assertTestModeEnabled();

    const result =
      operation === 'credit'
        ? await walletService.credit(userId, amount, 'SANDBOX_CREDIT', {
            description: note ?? 'Admin test mode credit',
            referenceType: 'admin_test',
            metadata: { testMode: true, actorId },
          })
        : await walletService.debit(userId, amount, 'SANDBOX_DEBIT', {
            description: note ?? 'Admin test mode debit',
            referenceType: 'admin_test',
            metadata: { testMode: true, actorId },
          });

    await auditService.log({
      actorId,
      action: 'TEST_SESSION_CONTROL',
      targetType: 'wallet',
      targetId: result.walletId,
      after: { operation, amount, note },
      metadata: { testMode: true },
    });

    return { ...result, testMode: true, sandbox: true };
  }

  async forceDiceOutcome(
    sessionId: string,
    dice: [string, string],
    actorId: string,
  ) {
    this.assertTestModeEnabled();
    await this.assertTestSession(sessionId);

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });
    if (!session || session.game.slug !== 'dice') {
      throw new NotFoundError('Dice test session not found');
    }

    const { sessionService } = await import('../sessions/session.service.js');
    const holder = await prisma.gamePlayer.findFirst({
      where: { sessionId, status: { not: 'LEFT' } },
      orderBy: { seatIndex: 'asc' },
    });
    const actorUserId = holder?.userId ?? actorId;

    await sessionService.processAction(sessionId, actorUserId, DICE_ACTIONS.FORCE_DICE, { dice });

    await auditService.log({
      actorId,
      action: 'TEST_SESSION_CONTROL',
      targetType: 'game_session',
      targetId: sessionId,
      after: { forcedDice: dice },
      metadata: { operation: 'force_dice', testMode: true },
    });

    return { sessionId, forcedDice: dice, testMode: true };
  }
}

export const testModeService = new TestModeService();
