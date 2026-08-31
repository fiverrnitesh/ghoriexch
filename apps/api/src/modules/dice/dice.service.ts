import type { Prisma, GameSession } from '@prisma/client';
import type { GameEngineEvent } from '@games/game-engine';
import {
  DEFAULT_DICE_CONFIG,
  DICE_MAX_REAL_PLAYERS,
  claimRoundSettlement,
  computeMatchedPoolSettlement,
  diceGameEngine,
  evaluateSideBet,
  sanitizePublicDiceState,
  seatTigerBot,
  type DiceGameState,
  type DiceRoundResult,
} from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { walletService } from '../wallet/wallet.service.js';
import { bettingService } from '../betting/betting.service.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { parseAmount } from '../../lib/utils.js';
import { env } from '../../config/env.js';
import { getDicePlayerMeta } from './dice-player-meta.js';

let platformAdminUserId: string | null = null;

async function getPlatformAdminUserId(): Promise<string> {
  if (platformAdminUserId) return platformAdminUserId;
  const admin = await prisma.user.findUnique({ where: { email: 'admin@games.local' }, select: { id: true } });
  if (!admin) throw new Error('Platform admin user not found — run db:seed');
  platformAdminUserId = admin.id;
  return admin.id;
}

export class DiceService {
  async getConfig(gameId: string) {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    const configs = await prisma.gameConfiguration.findMany({ where: { gameId, isActive: true } });
    const settings = configs.find((c) => c.key === 'settings')?.value as Record<string, unknown> | undefined;

    return {
      minPlayers: game?.minPlayers ?? DEFAULT_DICE_CONFIG.minPlayers,
      maxPlayers: Math.min(game?.maxPlayers ?? DEFAULT_DICE_CONFIG.maxPlayers, DICE_MAX_REAL_PLAYERS),
      minEffectivePopulation: DEFAULT_DICE_CONFIG.minEffectivePopulation,
      sideBetWindowSeconds: Number(settings?.sideBetWindowSeconds ?? DEFAULT_DICE_CONFIG.sideBetWindowSeconds),
      opponentMatchWindowSeconds: Number(settings?.opponentMatchWindowSeconds ?? DEFAULT_DICE_CONFIG.opponentMatchWindowSeconds),
      finalLockSeconds: Number(settings?.finalLockSeconds ?? DEFAULT_DICE_CONFIG.finalLockSeconds),
      platformFeeRate: Number(settings?.platformFeeRate ?? DEFAULT_DICE_CONFIG.platformFeeRate),
      turnTimeoutSeconds: Number(settings?.turnTimeoutSeconds ?? DEFAULT_DICE_CONFIG.turnTimeoutSeconds),
      payoutMultiplier: Number(settings?.payoutMultiplier ?? DEFAULT_DICE_CONFIG.payoutMultiplier),
      minBet: Number(game?.minBet ?? settings?.minBet ?? DEFAULT_DICE_CONFIG.minBet),
      maxBet: Number(game?.maxBet ?? settings?.maxBet ?? DEFAULT_DICE_CONFIG.maxBet),
      // Always "Shoot" — ignore legacy settings that still say TIGER.
      botName: DEFAULT_DICE_CONFIG.botName,
    };
  }

  async getConfigForRoom(roomId?: string) {
    if (!roomId) return DEFAULT_DICE_CONFIG;
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { game: true } });
    if (!room) return DEFAULT_DICE_CONFIG;
    return this.getConfig(room.gameId);
  }

  async handleEngineEvents(
    session: GameSession & { game?: { id: string; slug: string } },
    events: GameEngineEvent[],
    input: { userId: string; action: string; payload: Record<string, unknown> },
  ) {
    for (const event of events) {
      if (event.type === 'dice:main_bet_placed') {
        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const mainBet = state.mainBet;
        if (!mainBet || mainBet.holderLocked) continue;

        const stake = parseAmount(mainBet.amount);
        const config = state.config;
        if (stake < config.minBet || stake > config.maxBet) {
          throw new ValidationError(`Bet must be between ${config.minBet} and ${config.maxBet}`);
        }

        const holderUserId = state.activeMatch?.holderSeatIndex !== undefined
          ? this.getSeatUserId(state, state.activeMatch.holderSeatIndex)
          : null;
        const game = session.game ?? await prisma.game.findUnique({ where: { id: session.gameId } });
        const baseIdempotency = input.payload.idempotencyKey
          ? String(input.payload.idempotencyKey)
          : `main-${state.roundId}`;

        if (holderUserId) {
          await walletService.gameDebit(
            holderUserId,
            stake,
            session.id,
            undefined,
            `${baseIdempotency}-holder`,
          );
          const holderBet = await prisma.bet.create({
            data: {
              gameId: game!.id,
              sessionId: session.id,
              roomId: session.roomId,
              userId: holderUserId,
              amount: stake,
              status: 'LOCKED',
              selection: { type: 'MAIN', role: 'HOLDER', choice: mainBet.choice } as Prisma.InputJsonValue,
              idempotencyKey: `${baseIdempotency}-holder-bet`,
              metadata: { roundId: state.roundId, role: 'HOLDER' } as Prisma.InputJsonValue,
            },
          });
          mainBet.betId = holderBet.id;
          mainBet.holderLocked = true;
          await prisma.gameSession.update({
            where: { id: session.id },
            data: { state: state as unknown as Prisma.InputJsonValue },
          });
        }
      }

      if (event.type === 'dice:main_match_confirmed') {
        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const mainBet = state.mainBet;
        if (!mainBet || mainBet.locked) continue;

        const stake = parseAmount(mainBet.amount);
        const opponentStake = parseAmount(mainBet.opponentStake ?? mainBet.amount);
        if (stake !== opponentStake) {
          throw new ValidationError('Matched bets must be equal');
        }

        const opponentSeatIndex = state.activeMatch?.opponentSeatIndex;
        const opponentUserId = opponentSeatIndex !== undefined ? this.getSeatUserId(state, opponentSeatIndex) : null;
        const game = session.game ?? await prisma.game.findUnique({ where: { id: session.gameId } });
        const baseIdempotency = input.payload.idempotencyKey
          ? String(input.payload.idempotencyKey)
          : `main-${state.roundId}`;

        mainBet.matchedPool = stake + opponentStake;
        mainBet.opponentStake = opponentStake;

        try {
          const tigerIsCounterparty = mainBet.opponentBotId === 'tiger';
          if (opponentUserId && !tigerIsCounterparty) {
            await walletService.gameDebit(
              opponentUserId,
              opponentStake,
              session.id,
              undefined,
              `${baseIdempotency}-opponent`,
            );
            const opponentBet = await prisma.bet.create({
              data: {
                gameId: game!.id,
                sessionId: session.id,
                roomId: session.roomId,
                userId: opponentUserId,
                amount: opponentStake,
                status: 'LOCKED',
                selection: { type: 'MAIN', role: 'OPPONENT', choice: mainBet.choice } as Prisma.InputJsonValue,
                idempotencyKey: `${baseIdempotency}-opponent-bet`,
                metadata: { roundId: state.roundId, role: 'OPPONENT' } as Prisma.InputJsonValue,
              },
            });
            mainBet.opponentBetId = opponentBet.id;
            mainBet.opponentUserId = opponentUserId;
          } else {
            mainBet.opponentBotId = mainBet.opponentBotId ?? (opponentSeatIndex !== undefined
              ? this.getSeatBotId(state, opponentSeatIndex) ?? 'tiger'
              : 'tiger');
          }

          mainBet.locked = true;
          await prisma.gameSession.update({
            where: { id: session.id },
            data: { state: state as unknown as Prisma.InputJsonValue },
          });
        } catch (err) {
          if (mainBet.betId && mainBet.holderLocked) {
            const holderUserId = this.getSeatUserId(state, state.activeMatch!.holderSeatIndex);
            if (holderUserId) {
              await walletService.refund(holderUserId, stake, {
                referenceType: 'game_session',
                referenceId: session.id,
                idempotencyKey: `${baseIdempotency}-holder-rollback`,
                description: 'Rollback holder debit after opponent lock failure',
              });
              await prisma.bet.updateMany({
                where: { id: mainBet.betId, status: 'LOCKED' },
                data: { status: 'CANCELLED' },
              });
              mainBet.betId = undefined;
              mainBet.holderLocked = false;
            }
          }
          throw err;
        }
      }

      if (event.type === 'dice:opponent_match_expired') {
        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const payloadBet = event.payload.mainBet as DiceGameState['mainBet'];
        const betId = payloadBet?.betId;
        const holderUserId = payloadBet?.userId;
        const amount = payloadBet?.amount;
        if (betId && holderUserId && amount) {
          await walletService.refund(holderUserId, parseAmount(amount), {
            referenceType: 'game_session',
            referenceId: session.id,
            idempotencyKey: `refund-${state.roundId}-opponent-expired`,
            description: 'Refund holder stake — no opponent match',
          });
          await prisma.bet.updateMany({
            where: { id: betId, status: 'LOCKED' },
            data: { status: 'CANCELLED' },
          });
        }
      }

      if (event.type === 'dice:betting_locked') {
        // Legacy event — no-op for new flow
        continue;
      }

      if (event.type === 'dice:settlement') {
        const result = event.payload.result as DiceRoundResult;
        if (result.outcome === 'NO_RESULT') continue;
        const mainBet = event.payload.mainBet as DiceGameState['mainBet'];
        const roundId = String(event.payload.roundId);
        const roundNumber = Number(event.payload.roundNumber ?? 0);
        const completedMatch = event.payload.completedMatch as { holderSeatIndex: number; opponentSeatIndex: number } | undefined;
        const settlementId = `settle-${roundId}`;

        const existingRound = await prisma.diceRound.findFirst({
          where: { OR: [{ roundId }, { settlementId }] },
        });
        if (existingRound) continue;

        if (!claimRoundSettlement(roundId)) continue;

        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const holderSeat = completedMatch?.holderSeatIndex ?? state.activeMatch?.holderSeatIndex ?? 0;
        const opponentSeat = completedMatch?.opponentSeatIndex ?? state.activeMatch?.opponentSeatIndex ?? 0;

        const holderUserId = this.getSeatUserId(state, holderSeat);
        const opponentUserId = this.getSeatUserId(state, opponentSeat);
        const holderBotId = this.getSeatBotId(state, holderSeat);
        const opponentBotId = this.getSeatBotId(state, opponentSeat);

        const holderWins = result.outcome === 'WIN';
        const winnerUserId = holderWins ? holderUserId : opponentUserId;
        const winnerBotId = holderWins ? holderBotId : opponentBotId;
        const winnerSeat = holderWins ? holderSeat : opponentSeat;

        if (mainBet?.betId) {
          if (holderWins) {
            await bettingService.settleBet(mainBet.betId, 'WON', result.winnerPayout, `${settlementId}-holder-credit`);
          } else {
            await bettingService.settleBet(mainBet.betId, 'LOST', 0, `${settlementId}-holder-loss`);
          }
        }

        if (mainBet?.opponentBetId) {
          if (!holderWins) {
            await bettingService.settleBet(mainBet.opponentBetId, 'WON', result.winnerPayout, `${settlementId}-opponent-credit`);
          } else {
            await bettingService.settleBet(mainBet.opponentBetId, 'LOST', 0, `${settlementId}-opponent-loss`);
          }
        }

        if (result.adminFee > 0) {
          const adminUserId = await getPlatformAdminUserId();
          await walletService.recordPlatformFee(
            adminUserId,
            result.adminFee,
            roundId,
            `${settlementId}-platform-fee`,
          );
        }

        await this.settleSideBets(session.id, roundId, result.outcome, state.config.platformFeeRate);

        await prisma.diceRound.create({
          data: {
            sessionId: session.id,
            roomId: session.roomId,
            roundNumber: roundNumber || state.roundNumber,
            roundId,
            settlementId,
            die1: String(result.die1),
            die2: String(result.die2),
            hasBlank: result.hasBlank,
            playerChoice: result.playerChoice,
            outcome: result.outcome,
            mainBetAmount: mainBet?.amount,
            mainBetPayout: result.winnerPayout,
            holderStake: result.holderStake,
            opponentStake: result.opponentStake,
            matchedPool: result.matchedPool,
            adminFee: result.adminFee,
            winnerPayout: result.winnerPayout,
            holderUserId,
            holderBotId,
            opponentUserId,
            opponentBotId,
            winnerUserId,
            winnerBotId,
            serverSeedHash: session.serverSeedHash,
            nonce: session.nonce,
            metadata: {
              result,
              holderNet: result.holderNet,
              opponentNet: result.opponentNet,
              loserLoss: result.loserLoss,
              winnerSeatIndex: winnerSeat,
              sideBets: state.sideBets.length,
            } as unknown as Prisma.InputJsonValue,
            settledAt: new Date(),
          },
        });
      }

      if (event.type === 'dice:side_bet_request') {
        const { sideBetId } = event.payload as { sideBetId: string };
        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const sb = state.sideBets.find((s) => s.id === sideBetId);
        if (!sb) continue;

        await walletService.lock(sb.backerUserId, sb.amount, {
          referenceType: 'side_bet',
          referenceId: sideBetId,
          idempotencyKey: `lock-${sideBetId}`,
          description: 'Side bet locked pending acceptance',
        });

        await prisma.sideBet.create({
          data: {
            id: sideBetId,
            sessionId: session.id,
            roundNumber: state.roundNumber,
            roundId: state.roundId,
            backerUserId: sb.backerUserId,
            targetUserId: sb.counterpartyUserId ?? sb.targetUserId ?? '',
            prediction: sb.prediction,
            amount: sb.amount,
            status: 'PENDING',
            expiresAt: sb.expiresAt ? new Date(sb.expiresAt) : undefined,
            idempotencyKey: input.payload.idempotencyKey ? String(input.payload.idempotencyKey) : sideBetId,
          },
        });
      }

      if (event.type === 'dice:side_bet_accepted') {
        const { sideBetId, acceptedAmount } = event.payload as {
          sideBetId: string;
          acceptedAmount?: number;
        };
        const state = (await prisma.gameSession.findUnique({ where: { id: session.id } }))!.state as unknown as DiceGameState;
        const sb = state.sideBets.find((s) => s.id === sideBetId);
        const counterpartyId = sb?.counterpartyUserId ?? sb?.targetUserId ?? null;
        const playerPart = acceptedAmount ?? sb?.counterpartyAcceptedAmount ?? sb?.playerAcceptedAmount ?? 0;
        const systemPart = sb?.systemLiability ?? sb?.tigerLiability ?? 0;

        if (playerPart > 0 && counterpartyId) {
          await walletService.lock(counterpartyId, playerPart, {
            referenceType: 'side_bet',
            referenceId: `${sideBetId}-acceptor`,
            idempotencyKey: `accept-lock-${sideBetId}`,
            description: 'Peer bet liability locked',
          });
        }

        await prisma.sideBet.updateMany({
          where: { id: sideBetId, status: { in: ['PENDING', 'ACCEPTED'] } },
          data: {
            status: 'ACCEPTED',
            metadata: {
              counterpartyAcceptedAmount: playerPart,
              systemLiability: systemPart,
              displayAcceptedByUserId: sb?.displayAcceptedByUserId ?? counterpartyId,
              playerAcceptedAmount: playerPart,
              tigerLiability: systemPart,
              playerLiabilityUserId: counterpartyId,
            } as Prisma.InputJsonValue,
          },
        });
      }

      if (event.type === 'dice:side_bet_rejected') {
        const { sideBetId } = event.payload as { sideBetId: string };
        const sb = await prisma.sideBet.findUnique({ where: { id: sideBetId } });
        if (sb?.status === 'PENDING') {
          await walletService.unlock(sb.backerUserId, parseAmount(sb.amount.toString()), {
            referenceType: 'side_bet',
            referenceId: sideBetId,
            idempotencyKey: `reject-unlock-${sideBetId}`,
          });
          await prisma.sideBet.update({ where: { id: sideBetId }, data: { status: 'REJECTED' } });
        }
      }

      if (event.type === 'dice:side_bet_expired') {
        const { sideBetId } = event.payload as { sideBetId: string };
        const sb = await prisma.sideBet.findUnique({ where: { id: sideBetId } });
        if (sb?.status === 'PENDING') {
          await walletService.unlock(sb.backerUserId, parseAmount(sb.amount.toString()), {
            referenceType: 'side_bet',
            referenceId: sideBetId,
            idempotencyKey: `expire-unlock-${sideBetId}`,
          });
          await prisma.sideBet.update({ where: { id: sideBetId }, data: { status: 'CANCELLED' } });
        }
      }
    }
  }

  async settleSideBets(
    sessionId: string,
    roundId: string,
    mainOutcome: 'WIN' | 'LOSS',
    platformFeeRate: number,
  ) {
    const accepted = await prisma.sideBet.findMany({
      where: { sessionId, roundId, status: 'ACCEPTED' },
    });
    const adminUserId = await getPlatformAdminUserId();

    for (const sb of accepted) {
      const meta = (sb.metadata ?? {}) as {
        counterpartyAcceptedAmount?: number;
        systemLiability?: number;
        displayAcceptedByUserId?: string | null;
        playerAcceptedAmount?: number;
        tigerLiability?: number;
        playerLiabilityUserId?: string | null;
      };
      const total = parseAmount(sb.amount.toString());
      const playerPart = parseAmount(String(
        meta.counterpartyAcceptedAmount ?? meta.playerAcceptedAmount ?? 0,
      ));
      const tigerPart = parseAmount(String(
        meta.systemLiability ?? meta.tigerLiability ?? (playerPart > 0 ? total - playerPart : total),
      ));
      const acceptorId = meta.displayAcceptedByUserId
        ?? meta.playerLiabilityUserId
        ?? sb.targetUserId;

      const finalStatus = evaluateSideBet(
        {
          id: sb.id,
          backerUserId: sb.backerUserId,
          counterpartyUserId: sb.targetUserId,
          targetUserId: sb.targetUserId,
          prediction: sb.prediction as 'WIN' | 'LOSS',
          amount: total,
          status: 'ACCEPTED',
          expiresAt: sb.expiresAt?.toISOString() ?? new Date().toISOString(),
        },
        mainOutcome,
        total,
        1.9,
      );

      const portions: Array<{ kind: 'player' | 'tiger'; stake: number }> = [];
      if (playerPart > 0) portions.push({ kind: 'player', stake: playerPart });
      if (tigerPart > 0) portions.push({ kind: 'tiger', stake: tigerPart });
      if (portions.length === 0) portions.push({ kind: 'tiger', stake: total });

      await walletService.unlock(sb.backerUserId, total, {
        referenceType: 'side_bet',
        referenceId: sb.id,
        idempotencyKey: `unlock-${sb.id}`,
      }).catch(() => undefined);

      for (const portion of portions) {
        const { adminFee, winnerPayout } = computeMatchedPoolSettlement(
          portion.stake,
          portion.stake,
          platformFeeRate,
        );
        const feeKey = `settle-${roundId}-side-${sb.id}-${portion.kind}-fee`;

        if (finalStatus === 'WON') {
          await walletService.gameCredit(
            sb.backerUserId,
            winnerPayout,
            sessionId,
            sb.id,
            `side-win-${sb.id}-${portion.kind}`,
          );
          if (portion.kind === 'player' && acceptorId) {
            await walletService.unlock(acceptorId, portion.stake, {
              referenceType: 'side_bet',
              referenceId: `${sb.id}-acceptor`,
              idempotencyKey: `accept-unlock-loss-${sb.id}`,
            }).catch(() => undefined);
            await walletService.debit(acceptorId, portion.stake, 'GAME_DEBIT', {
              referenceType: 'side_bet',
              referenceId: `${sb.id}-acceptor`,
              idempotencyKey: `accept-loss-${sb.id}`,
              description: 'Peer bet liability lost',
            });
          } else if (portion.kind === 'tiger') {
            await walletService.debit(adminUserId, winnerPayout, 'GAME_DEBIT', {
              referenceType: 'side_bet',
              referenceId: `${sb.id}-house`,
              idempotencyKey: `house-loss-${sb.id}`,
              description: 'House peer bet liability lost',
            });
          }
        } else {
          await walletService.debit(sb.backerUserId, portion.stake, 'GAME_DEBIT', {
            referenceType: 'side_bet',
            referenceId: sb.id,
            idempotencyKey: `side-loss-${sb.id}-${portion.kind}`,
            description: 'Peer bet lost',
          });
          if (portion.kind === 'player' && acceptorId) {
            await walletService.unlock(acceptorId, portion.stake, {
              referenceType: 'side_bet',
              referenceId: `${sb.id}-acceptor`,
              idempotencyKey: `accept-unlock-win-${sb.id}`,
            }).catch(() => undefined);
            await walletService.gameCredit(
              acceptorId,
              winnerPayout,
              sessionId,
              sb.id,
              `side-accept-win-${sb.id}`,
            );
          } else if (portion.kind === 'tiger') {
            await walletService.gameCredit(
              adminUserId,
              winnerPayout,
              sessionId,
              sb.id,
              `house-peer-win-${sb.id}`,
            );
          }
        }

        if (adminFee > 0) {
          await walletService.recordPlatformFee(adminUserId, adminFee, roundId, feeKey);
        }
      }

      await prisma.sideBet.update({
        where: { id: sb.id },
        data: { status: finalStatus, settledAt: new Date() },
      });
    }
  }

  async listRoundHistory(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = {
      OR: [
        { holderUserId: userId },
        { opponentUserId: userId },
        { winnerUserId: userId },
        { session: { players: { some: { userId, status: { not: 'LEFT' as const } } } } },
      ],
    };

    const [rounds, total] = await Promise.all([
      prisma.diceRound.findMany({
        where,
        include: {
          session: {
            select: {
              room: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { settledAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.diceRound.count({ where }),
    ]);

    const userIds = new Set<string>();
    for (const r of rounds) {
      if (r.holderUserId) userIds.add(r.holderUserId);
      if (r.opponentUserId) userIds.add(r.opponentUserId);
      if (r.winnerUserId) userIds.add(r.winnerUserId);
    }

    const users = userIds.size
      ? await prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, username: true, displayName: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]));

    const roundIds = rounds.map((r) => r.roundId);
    const sideBets = roundIds.length
      ? await prisma.sideBet.findMany({
          where: { roundId: { in: roundIds }, OR: [{ backerUserId: userId }, { targetUserId: userId }] },
          select: {
            roundId: true,
            prediction: true,
            amount: true,
            status: true,
            backerUserId: true,
            targetUserId: true,
          },
        })
      : [];

    const sideBetsByRound = new Map<string, typeof sideBets>();
    for (const sb of sideBets) {
      const list = sideBetsByRound.get(sb.roundId) ?? [];
      list.push(sb);
      sideBetsByRound.set(sb.roundId, list);
    }

    return {
      items: rounds.map((r) => ({
        id: r.id,
        roundId: r.roundId,
        roundNumber: r.roundNumber,
        settledAt: r.settledAt?.toISOString() ?? r.createdAt.toISOString(),
        roomCode: r.session.room?.code ?? null,
        player: r.holderUserId ? userMap.get(r.holderUserId) ?? 'Player' : 'Shoot',
        opponent: r.opponentUserId ? userMap.get(r.opponentUserId) ?? 'Player' : 'Shoot',
        die1: r.die1,
        die2: r.die2,
        hasBlank: r.hasBlank,
        choice: r.playerChoice,
        outcome: r.outcome,
        winner: r.winnerUserId ? userMap.get(r.winnerUserId) ?? 'Player' : 'Shoot',
        loser: r.winnerUserId === r.holderUserId
          ? (r.opponentUserId ? userMap.get(r.opponentUserId) ?? 'Player' : 'Shoot')
          : (r.holderUserId ? userMap.get(r.holderUserId) ?? 'Player' : 'Shoot'),
        mainBetAmount: r.mainBetAmount ? parseAmount(r.mainBetAmount.toString()) : null,
        mainBetPayout: r.mainBetPayout ? parseAmount(r.mainBetPayout.toString()) : null,
        sideBets: (sideBetsByRound.get(r.roundId) ?? []).map((sb) => ({
          prediction: sb.prediction,
          amount: parseAmount(sb.amount.toString()),
          status: sb.status,
          role: sb.backerUserId === userId ? 'BACKER' : 'TARGET',
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getPublicState(sessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        game: { select: { slug: true, name: true } },
        room: { select: { code: true, name: true } },
      },
    });
    if (!session) throw new NotFoundError('Session not found');

    let rawState = session.state as unknown as DiceGameState;
    if (rawState?.seats) {
      seatTigerBot(rawState);
      diceGameEngine.loadState(sessionId, rawState);
      rawState = diceGameEngine.getInternalState(sessionId) ?? rawState;
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: { state: rawState as unknown as Prisma.InputJsonValue },
      });
    }

    const state = sanitizePublicDiceState(rawState);
    const playerMeta = await getDicePlayerMeta(rawState);

    if (env.isDev && session.room?.code === 'DICE10SIM') {
      for (const seat of rawState.seats) {
        const occ = seat.occupant;
        if (occ?.type === 'USER' && occ.userId && occ.name && playerMeta[occ.userId]) {
          playerMeta[occ.userId].displayName = occ.name;
        }
      }
    }

    return {
      sessionId: session.id,
      room: session.room,
      game: session.game,
      status: session.status,
      isTestMode: session.isTestMode,
      state,
      playerMeta,
      sandbox: env.wallet.sandboxMode,
    };
  }

  private getSeatUserId(state: DiceGameState, seatIndex: number): string | null {
    const seat = state.seats.find((s) => s.seatIndex === seatIndex);
    if (seat?.occupant?.type === 'USER') return seat.occupant.userId ?? null;
    return null;
  }

  private getSeatBotId(state: DiceGameState, seatIndex: number): string | null {
    const seat = state.seats.find((s) => s.seatIndex === seatIndex);
    if (seat?.occupant?.type === 'BOT') return seat.occupant.botId ?? null;
    return null;
  }
}

export const diceService = new DiceService();
