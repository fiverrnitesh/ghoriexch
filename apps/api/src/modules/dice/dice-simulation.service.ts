import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  DICE_ACTIONS,
  diceGameEngine,
  getActiveHolderActorId,
  getActiveOpponentActorId,
  getActivePhaseDeadline,
  isEligibleSideBettor,
  type DiceGameState,
} from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { sessionService } from '../sessions/session.service.js';
import { roomService } from '../rooms/room.service.js';
import { diceService } from './dice.service.js';
import {
  DEFAULT_SIMULATION_CONFIG,
  SIMULATION_PLAYERS,
  SIMULATION_ROOM_CODE,
  SIMULATION_ROOM_NAME,
  SIM_BET_AMOUNTS,
  createEmptySimulationStats,
  type SimulationConfig,
  type SimulationStats,
} from './dice-simulation.constants.js';

const LOG_PREFIX = '[SIM]';
const ERROR_PREFIX = '[SIM ERROR]';
const MAX_LOG_LINES = 200;

interface RunnerContext {
  sessionId: string;
  config: SimulationConfig;
  stats: SimulationStats;
  logs: string[];
  running: boolean;
  nameByUserId: Map<string, string>;
  roundActions: Set<string>;
  lastRoundId: string | null;
  lastPhase: string | null;
  lastHolderSeat: number | null;
  lastRoundNumber: number | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  scheduledKey: string | null;
  intentionalTimeouts: Set<string>;
  sideBetTargetsHandled: Set<string>;
}

const activeRunners = new Map<string, RunnerContext>();

function delayRange(minSec: number, maxSec: number, speed: SimulationConfig['speed']): number {
  const factor = speed === 'fast' ? 0.25 : 1;
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000 * factor;
  return Math.max(100, Math.floor(ms));
}

function cappedDelay(desiredMs: number, deadlineIso: string | null | undefined): number {
  if (!deadlineIso) return desiredMs;
  const remaining = Date.parse(deadlineIso) - Date.now() - 400;
  if (remaining <= 0) return 0;
  return Math.min(desiredMs, remaining);
}

function pickBetAmount(state: DiceGameState): number {
  const { minBet, maxBet } = state.config;
  const options = SIM_BET_AMOUNTS.filter((a) => a >= minBet && a <= maxBet);
  if (options.length === 0) return minBet;
  return options[Math.floor(Math.random() * options.length)]!;
}

function shouldTimeout(rate: number): boolean {
  return Math.random() < rate;
}

export class DiceSimulationService {
  assertDevEnabled() {
    if (!env.isDev) {
      throw new ForbiddenError('Simulation is only available in development mode');
    }
  }

  getStatus() {
    this.assertDevEnabled();
    const runners = [...activeRunners.values()].map((r) => ({
      sessionId: r.sessionId,
      running: r.running,
      config: r.config,
      stats: r.stats,
      logs: r.logs.slice(-40),
      lastPhase: r.lastPhase,
      lastRoundId: r.lastRoundId,
    }));
    return {
      room: { code: SIMULATION_ROOM_CODE, name: SIMULATION_ROOM_NAME },
      players: SIMULATION_PLAYERS,
      defaultConfig: DEFAULT_SIMULATION_CONFIG,
      activeRunners: runners,
    };
  }

  /** Persist the single DEV simulation room + 10 seated players. Safe to call on API boot. */
  async ensureSimulationRoom() {
    this.assertDevEnabled();

    const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
    if (!game) throw new NotFoundError('Dice game not available');

    const simUsers = await this.loadSimulationUsers();
    const acceptedIds = simUsers.map((u) => u.id);

    let room = await prisma.room.findUnique({
      where: { code: SIMULATION_ROOM_CODE },
      include: {
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!room) {
      const created = await roomService.create({
        gameId: game.id,
        hostUserId: simUsers[0]!.id,
        name: SIMULATION_ROOM_NAME,
        maxPlayers: 10,
        minBet: game.minBet ? Number(game.minBet) : undefined,
        maxBet: game.maxBet ? Number(game.maxBet) : undefined,
        gameMode: 'FRIENDS',
        isSystemRoom: true,
      });
      room = await prisma.room.update({
        where: { id: created.id },
        data: {
          code: SIMULATION_ROOM_CODE,
          status: 'OPEN',
          isPrivate: true,
          metadata: {
            gameMode: 'FRIENDS',
            isSystemRoom: true,
            simulationRoom: true,
            acceptedParticipantIds: acceptedIds,
            pendingJoinRequests: [],
          } as Prisma.InputJsonValue,
        },
        include: {
          sessions: {
            where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    } else {
      room = await prisma.room.update({
        where: { id: room.id },
        data: {
          name: SIMULATION_ROOM_NAME,
          maxPlayers: 10,
          status: 'OPEN',
          metadata: {
            gameMode: 'FRIENDS',
            isSystemRoom: true,
            simulationRoom: true,
            acceptedParticipantIds: acceptedIds,
            pendingJoinRequests: [],
          } as Prisma.InputJsonValue,
        },
        include: {
          sessions: {
            where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    }

    let sessionId = room.sessions[0]?.id;
    if (!sessionId) {
      const session = await sessionService.createSession('dice', simUsers[0]!.id, room.id);
      sessionId = session.id;
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: { isTestMode: true },
      });
    } else {
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: { isTestMode: true },
      });
    }

    for (const user of simUsers) {
      try {
        await sessionService.joinSession(sessionId, user.id);
      } catch {
        // already seated
      }
    }

    await this.applySimulationSeatNames(sessionId, simUsers);

    const seated = await prisma.gamePlayer.count({
      where: { sessionId, status: { not: 'LEFT' } },
    });

    return {
      roomId: room.id,
      roomCode: SIMULATION_ROOM_CODE,
      sessionId,
      playerCount: seated,
    };
  }

  async getOrCreateSimulationRoom(viewerUserId: string) {
    this.assertDevEnabled();
    const ensured = await this.ensureSimulationRoom();

    const simUsers = await this.loadSimulationUsers();
    const simUserIds = new Set(simUsers.map((u) => u.id));
    if (simUserIds.has(viewerUserId)) {
      try {
        await sessionService.joinSession(ensured.sessionId, viewerUserId);
      } catch {
        // already seated
      }
    }

    const publicState = await diceService.getPublicState(ensured.sessionId);
    return {
      ...publicState,
      room: await roomService.getByCode(SIMULATION_ROOM_CODE),
      sessionId: ensured.sessionId,
    };
  }

  async startSimulation(sessionId: string, config?: Partial<SimulationConfig>) {
    this.assertDevEnabled();
    if (activeRunners.get(sessionId)?.running) {
      throw new ValidationError('Simulation already running for this session');
    }

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { room: true } });
    if (!session) throw new NotFoundError('Session not found');
    if (session.room?.code !== SIMULATION_ROOM_CODE) {
      throw new ValidationError('Not a simulation session');
    }

    const simUsers = await this.loadSimulationUsers();
    for (const user of simUsers) {
      try {
        await sessionService.joinSession(sessionId, user.id);
      } catch {
        // already seated
      }
    }
    const nameByUserId = new Map(simUsers.map((u) => {
      const meta = SIMULATION_PLAYERS.find((p) => p.email === u.email);
      return [u.id, meta?.displayName ?? u.displayName ?? u.username];
    }));

    await this.applySimulationSeatNames(sessionId, simUsers);

    const locked = await prisma.wallet.aggregate({
      where: { userId: { in: simUsers.map((u) => u.id) } },
      _sum: { lockedBalance: true },
    });
    if (Number(locked._sum.lockedBalance ?? 0) === 0) {
      await this.resetSimulationBalances();
    }

    const runner: RunnerContext = {
      sessionId,
      config: { ...DEFAULT_SIMULATION_CONFIG, ...config },
      stats: createEmptySimulationStats(),
      logs: [],
      running: true,
      nameByUserId,
      roundActions: new Set(),
      lastRoundId: null,
      lastPhase: null,
      lastHolderSeat: null,
      lastRoundNumber: null,
      pendingTimer: null,
      tickTimer: null,
      scheduledKey: null,
      intentionalTimeouts: new Set(),
      sideBetTargetsHandled: new Set(),
    };

    activeRunners.set(sessionId, runner);
    this.log(runner, 'Simulation started — 10 players, continuous play');
    runner.tickTimer = setInterval(() => void this.tick(runner), 400);
    void this.tick(runner);

    return { sessionId, running: true, config: runner.config };
  }

  stopSimulation(sessionId: string) {
    this.assertDevEnabled();
    const runner = activeRunners.get(sessionId);
    if (!runner) {
      return { sessionId, running: false, summary: null };
    }

    runner.running = false;
    if (runner.pendingTimer) clearTimeout(runner.pendingTimer);
    if (runner.tickTimer) clearInterval(runner.tickTimer);
    runner.pendingTimer = null;
    runner.tickTimer = null;

    const summary = { ...runner.stats, logs: runner.logs.slice(-80) };
    this.log(runner, 'Simulation stopped');
    this.logSummary(runner);
    activeRunners.delete(sessionId);

    return { sessionId, running: false, summary };
  }

  async getRunnerStatus(sessionId: string) {
    this.assertDevEnabled();
    const runner = activeRunners.get(sessionId);
    if (!runner) return { running: false, stats: null, logs: [], config: null, phase: null, roundNumber: null };

    let roundNumber = runner.lastRoundNumber;
    let phase = runner.lastPhase;
    try {
      const state = await this.loadState(sessionId);
      roundNumber = state.roundNumber;
      phase = state.phase;
    } catch {
      // keep cached
    }

    return {
      running: runner.running,
      stats: runner.stats,
      logs: runner.logs.slice(-40),
      config: runner.config,
      phase,
      roundNumber,
    };
  }

  private async loadSimulationUsers() {
    const emails = SIMULATION_PLAYERS.map((p) => p.email);
    const users = await prisma.user.findMany({ where: { email: { in: [...emails] } } });
    if (users.length < SIMULATION_PLAYERS.length) {
      throw new ValidationError('Simulation users missing — run npm run db:seed');
    }
    return users;
  }

  private async applySimulationSeatNames(
    sessionId: string,
    simUsers: Array<{ id: string; email: string }>,
  ) {
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session?.state) return;
    const state = session.state as unknown as DiceGameState;
    const nameByEmail = new Map<string, string>(SIMULATION_PLAYERS.map((p) => [p.email, p.displayName]));
    const nameByUserId = new Map(
      simUsers.map((u) => [u.id, nameByEmail.get(u.email) ?? 'Player']),
    );

    for (const seat of state.seats) {
      if (seat.occupant?.type === 'USER' && seat.occupant.userId) {
        const name = nameByUserId.get(seat.occupant.userId);
        if (name) seat.occupant.name = name;
      }
    }

    diceGameEngine.loadState(sessionId, state);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { state: state as unknown as Prisma.InputJsonValue },
    });
  }

  private async resetSimulationBalances() {
    for (const player of SIMULATION_PLAYERS) {
      const user = await prisma.user.findUnique({ where: { email: player.email } });
      if (!user) continue;
      await prisma.wallet.updateMany({
        where: { userId: user.id },
        data: {
          balance: player.balance,
          availableBalance: player.balance,
          lockedBalance: 0,
          currency: 'USD',
        },
      });
    }
  }

  private log(runner: RunnerContext, message: string) {
    const line = `${LOG_PREFIX} ${message}`;
    runner.logs.push(line);
    if (runner.logs.length > MAX_LOG_LINES) runner.logs.shift();
    console.log(line);
  }

  private logError(
    runner: RunnerContext,
    opts: {
      round: number;
      phase: string;
      player: string;
      action: string;
      error: string;
      expected?: string;
      actual?: string;
    },
  ) {
    runner.stats.failedRoundCount += 1;
    runner.stats.failedRounds.push({
      round: opts.round,
      phase: opts.phase,
      player: opts.player,
      action: opts.action,
      error: opts.error,
    });
    const detail = [
      `${ERROR_PREFIX} round=${opts.round} phase=${opts.phase} player=${opts.player} action=${opts.action}`,
      `error=${opts.error}`,
      opts.expected ? `expected=${opts.expected}` : null,
      opts.actual ? `actual=${opts.actual}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    runner.logs.push(detail);
    console.error(detail);
  }

  private logSummary(runner: RunnerContext) {
    const s = runner.stats;
    this.log(runner, '--- SIMULATION SUMMARY ---');
    this.log(runner, `Rounds completed: ${s.roundsCompleted}`);
    this.log(runner, `Rounds timed out: ${s.roundsTimedOut}`);
    this.log(runner, `Rounds settled: ${s.roundsSettled}`);
    this.log(runner, `Main bets placed: ${s.mainBetsPlaced}`);
    this.log(runner, `Opponent matches: ${s.opponentMatches}`);
    this.log(runner, `Opponent rejects/timeouts: ${s.opponentRejectsOrTimeouts}`);
    this.log(runner, `Side bets placed: ${s.sideBetsPlaced}`);
    this.log(runner, `Side bets accepted: ${s.sideBetsAccepted}`);
    this.log(runner, `Side bets rejected: ${s.sideBetsRejected}`);
    this.log(runner, `Dice rolls: ${s.diceRolls}`);
    this.log(runner, `ODD wins: ${s.oddWins}`);
    this.log(runner, `EVEN wins: ${s.evenWins}`);
    this.log(runner, `Blank results: ${s.blankResults}`);
    this.log(runner, `Platform fees: ${s.platformFeesGenerated}`);
    this.log(runner, `Settlement errors: ${s.settlementErrors}`);
    this.log(runner, `Wallet errors: ${s.walletErrors}`);
    this.log(runner, `FAILED ROUND COUNT: ${s.failedRoundCount}`);
    if (s.failedRounds.length) {
      for (const fr of s.failedRounds.slice(-10)) {
        this.log(runner, `  failed round ${fr.round} @ ${fr.phase}: ${fr.error}`);
      }
    }
  }

  private async loadState(sessionId: string): Promise<DiceGameState> {
    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    diceGameEngine.loadState(sessionId, session.state as unknown as DiceGameState);
    return diceGameEngine.getInternalState(sessionId)!;
  }

  private playerName(runner: RunnerContext, userId: string | null | undefined): string {
    if (!userId) return 'Unknown';
    return runner.nameByUserId.get(userId) ?? userId.slice(0, 8);
  }

  private async tick(runner: RunnerContext) {
    if (!runner.running || runner.pendingTimer || runner.scheduledKey) return;

    if (runner.config.maxRounds > 0 && runner.stats.roundsCompleted >= runner.config.maxRounds) {
      this.stopSimulation(runner.sessionId);
      return;
    }

    let state: DiceGameState;
    try {
      state = await this.loadState(runner.sessionId);
    } catch (err) {
      this.log(runner, `State load failed: ${(err as Error).message}`);
      return;
    }

    if (state.roundId !== runner.lastRoundId) {
      if (runner.lastRoundId !== null) {
        runner.stats.roundsCompleted += 1;
        await this.logCompletedRoundFromDb(runner, runner.lastRoundId);
      }
      runner.roundActions.clear();
      runner.intentionalTimeouts.clear();
      runner.sideBetTargetsHandled.clear();
      const holderId = getActiveHolderActorId(state);
      const opponentId = getActiveOpponentActorId(state);
      this.log(
        runner,
        `Round ${state.roundNumber} started — Holder: ${this.playerName(runner, holderId)}, Opponent: ${this.playerName(runner, opponentId)}`,
      );
      runner.lastRoundId = state.roundId;
      runner.lastRoundNumber = state.roundNumber;
      runner.lastHolderSeat = state.activeMatch?.holderSeatIndex ?? null;
    } else if (
      state.activeMatch
      && runner.lastHolderSeat !== null
      && state.activeMatch.holderSeatIndex !== runner.lastHolderSeat
    ) {
      const holderId = getActiveHolderActorId(state);
      const opponentId = getActiveOpponentActorId(state);
      this.log(
        runner,
        `Rotation → ${this.playerName(runner, holderId)} (Opponent: ${this.playerName(runner, opponentId)})`,
      );
      runner.lastHolderSeat = state.activeMatch.holderSeatIndex;
    }

    if (state.phase !== runner.lastPhase) {
      if (state.phase === 'FINAL_LOCK') {
        this.log(runner, 'Final lock');
      }
      runner.lastPhase = state.phase;
    }

    switch (state.phase) {
      case 'BETTING':
        await this.maybeScheduleHolderBet(runner, state);
        break;
      case 'OPPONENT_MATCHING':
      case 'MAIN_BET_PLACED':
        await this.maybeScheduleOpponentAction(runner, state);
        break;
      case 'SIDE_BETTING':
        await this.maybeScheduleSideBetting(runner, state);
        break;
      case 'FINAL_LOCK':
      case 'BETTING_LOCKED':
        await this.maybeScheduleRoll(runner, state);
        break;
      default:
        break;
    }
  }

  private scheduleAction(
    runner: RunnerContext,
    key: string,
    delayMs: number,
    fn: () => Promise<void>,
  ) {
    if (runner.roundActions.has(key) || runner.scheduledKey) return;
    runner.roundActions.add(key);
    runner.scheduledKey = key;
    runner.pendingTimer = setTimeout(() => {
      runner.pendingTimer = null;
      void fn().finally(() => {
        runner.scheduledKey = null;
        void this.tick(runner);
      });
    }, delayMs);
  }

  private async maybeScheduleHolderBet(runner: RunnerContext, state: DiceGameState) {
    const key = `${state.roundId}:${state.activeMatch?.holderSeatIndex ?? 'x'}:holder-bet`;
    if (runner.roundActions.has(key) || state.mainBet) return;

    const holderId = getActiveHolderActorId(state);
    if (!holderId) return;

    const timeoutKey = `${state.roundId}:holder-timeout`;
    if (shouldTimeout(runner.config.timeoutRate)) {
      runner.intentionalTimeouts.add(timeoutKey);
      runner.roundActions.add(key);
      this.log(runner, `Holder ${this.playerName(runner, holderId)} — intentional timeout (no bet)`);
      runner.stats.roundsTimedOut += 1;
      return;
    }

    const delay = cappedDelay(delayRange(1, 5, runner.config.speed), state.turnDeadlineAt);
    this.scheduleAction(runner, key, delay, async () => {
      const fresh = await this.loadState(runner.sessionId);
      if (fresh.phase !== 'BETTING' || fresh.mainBet) return;
      if (getActiveHolderActorId(fresh) !== holderId) return;

      const amount = pickBetAmount(fresh);
      const choice = Math.random() > 0.5 ? 'ODD' : 'EVEN';
      const idempotencyKey = `sim-main-${fresh.roundId}-${randomUUID()}`;

      try {
        await sessionService.processAction(runner.sessionId, holderId, DICE_ACTIONS.PLACE_MAIN_BET, {
          amount,
          choice,
          idempotencyKey,
        });
        runner.stats.mainBetsPlaced += 1;
        this.log(runner, `Holder bet: $${amount} ${choice} (${this.playerName(runner, holderId)})`);
      } catch (err) {
        runner.stats.walletErrors += 1;
        this.logError(runner, {
          round: fresh.roundNumber,
          phase: fresh.phase,
          player: this.playerName(runner, holderId),
          action: DICE_ACTIONS.PLACE_MAIN_BET,
          error: (err as Error).message,
        });
      }
    });
  }

  private async maybeScheduleOpponentAction(runner: RunnerContext, state: DiceGameState) {
    const key = `${state.roundId}:${state.activeMatch?.opponentSeatIndex ?? 'x'}:opponent-match`;
    if (runner.roundActions.has(key) || !state.mainBet || state.mainBet.locked) return;

    const opponentId = getActiveOpponentActorId(state);
    if (!opponentId) return;

    const timeoutKey = `${state.roundId}:opponent-timeout`;
    const forceTimeout = shouldTimeout(runner.config.timeoutRate);
    const forceReject = !forceTimeout && Math.random() > runner.config.opponentAcceptRate;

    if (forceTimeout) {
      runner.intentionalTimeouts.add(timeoutKey);
      runner.roundActions.add(key);
      this.log(runner, `Opponent ${this.playerName(runner, opponentId)} — intentional timeout (no accept)`);
      runner.stats.opponentRejectsOrTimeouts += 1;
      runner.stats.roundsTimedOut += 1;
      return;
    }

    if (forceReject) {
      runner.roundActions.add(key);
      this.log(runner, `Opponent ${this.playerName(runner, opponentId)} — intentional no-response (await timeout)`);
      runner.stats.opponentRejectsOrTimeouts += 1;
      return;
    }

    const deadline = getActivePhaseDeadline(state) ?? state.opponentMatchWindowEndsAt;
    const delay = cappedDelay(delayRange(1, 10, runner.config.speed), deadline);
    this.scheduleAction(runner, key, delay, async () => {
      const fresh = await this.loadState(runner.sessionId);
      if (!fresh.mainBet || fresh.mainBet.locked) return;
      if (fresh.phase !== 'OPPONENT_MATCHING' && fresh.phase !== 'MAIN_BET_PLACED') return;

      const amount = fresh.mainBet.amount;
      const idempotencyKey = `sim-accept-${fresh.roundId}-${randomUUID()}`;

      try {
        await sessionService.processAction(runner.sessionId, opponentId, DICE_ACTIONS.ACCEPT_OPPONENT_MATCH, {
          amount,
          idempotencyKey,
        });
        runner.stats.opponentMatches += 1;
        this.log(runner, `Opponent accepted: $${amount} (${this.playerName(runner, opponentId)})`);
      } catch (err) {
        runner.stats.walletErrors += 1;
        this.logError(runner, {
          round: fresh.roundNumber,
          phase: fresh.phase,
          player: this.playerName(runner, opponentId),
          action: DICE_ACTIONS.ACCEPT_OPPONENT_MATCH,
          error: (err as Error).message,
        });
      }
    });
  }

  private async maybeScheduleSideBetting(runner: RunnerContext, state: DiceGameState) {
    const holderId = getActiveHolderActorId(state);
    const opponentId = getActiveOpponentActorId(state);
    if (!holderId || !opponentId) return;

    for (const sb of state.sideBets) {
      const acceptKey = `${state.roundId}:side-accept:${sb.id}`;
      if (sb.status !== 'PENDING' || runner.roundActions.has(acceptKey)) continue;

      const targetTimeout = shouldTimeout(runner.config.timeoutRate * 0.5);
      if (targetTimeout) {
        runner.roundActions.add(acceptKey);
        this.log(runner, `Side bet ${sb.id} — intentional accept timeout`);
        continue;
      }

      const accept = Math.random() < runner.config.sideBetAcceptRate;
      const delay = cappedDelay(delayRange(1, 10, runner.config.speed), sb.expiresAt);
      this.scheduleAction(runner, acceptKey, delay, async () => {
        const fresh = await this.loadState(runner.sessionId);
        const pending = fresh.sideBets.find((s) => s.id === sb.id);
        if (!pending || pending.status !== 'PENDING') return;

        try {
          const action = accept ? DICE_ACTIONS.ACCEPT_SIDE_BET : DICE_ACTIONS.REJECT_SIDE_BET;
          await sessionService.processAction(runner.sessionId, pending.targetUserId, action, { sideBetId: sb.id });
          if (accept) {
            runner.stats.sideBetsAccepted += 1;
            this.log(
              runner,
              `Side bet accepted: ${this.playerName(runner, pending.backerUserId)} → ${this.playerName(runner, pending.targetUserId)} $${pending.amount}`,
            );
          } else {
            runner.stats.sideBetsRejected += 1;
            this.log(runner, `Side bet rejected: ${sb.id}`);
          }
        } catch (err) {
          this.logError(runner, {
            round: fresh.roundNumber,
            phase: fresh.phase,
            player: this.playerName(runner, pending.targetUserId),
            action: accept ? DICE_ACTIONS.ACCEPT_SIDE_BET : DICE_ACTIONS.REJECT_SIDE_BET,
            error: (err as Error).message,
          });
        }
      });
      return;
    }

    const spectators = state.seats
      .map((s) => (s.occupant?.type === 'USER' ? s.occupant.userId : null))
      .filter((id): id is string => Boolean(id))
      .filter((id) => isEligibleSideBettor(state, id));

    for (const userId of spectators) {
      const requestKey = `${state.roundId}:side-request:${userId}`;
      if (runner.roundActions.has(requestKey)) continue;
      if (Math.random() > runner.config.sideBetParticipationRate) {
        runner.roundActions.add(requestKey);
        continue;
      }

      const backHolder = Math.random() > 0.5;
      const targetUserId = backHolder ? holderId : opponentId;
      const delay = cappedDelay(delayRange(1, 15, runner.config.speed), state.sideBetWindowEndsAt);
      this.scheduleAction(runner, requestKey, delay, async () => {
        const fresh = await this.loadState(runner.sessionId);
        if (fresh.phase !== 'SIDE_BETTING') return;
        if (!isEligibleSideBettor(fresh, userId)) return;

        const amount = pickBetAmount(fresh);
        const sideBetId = `sim-sb-${fresh.roundId}-${userId}-${randomUUID()}`;

        try {
          await sessionService.processAction(runner.sessionId, userId, DICE_ACTIONS.REQUEST_SIDE_BET, {
            targetUserId,
            prediction: 'WIN',
            amount,
            sideBetId,
          });
          runner.stats.sideBetsPlaced += 1;
          const targetLabel = backHolder ? 'HOLDER' : 'OPPONENT';
          this.log(
            runner,
            `Side bet: ${this.playerName(runner, userId)} BACK ${targetLabel} $${amount}`,
          );
        } catch (err) {
          this.logError(runner, {
            round: fresh.roundNumber,
            phase: fresh.phase,
            player: this.playerName(runner, userId),
            action: DICE_ACTIONS.REQUEST_SIDE_BET,
            error: (err as Error).message,
          });
        }
      });
      return;
    }
  }

  private async maybeScheduleRoll(runner: RunnerContext, state: DiceGameState) {
    const key = `${state.roundId}:roll`;
    if (runner.roundActions.has(key)) return;
    if (!state.mainBet?.locked) return;

    const holderId = getActiveHolderActorId(state);
    if (!holderId) return;

    const timeoutKey = `${state.roundId}:roll-timeout`;
    if (shouldTimeout(runner.config.timeoutRate * 0.5)) {
      runner.intentionalTimeouts.add(timeoutKey);
      runner.roundActions.add(key);
      this.log(runner, 'Roll — intentional timeout (server auto-roll expected)');
      return;
    }

    const deadline = getActivePhaseDeadline(state) ?? state.finalLockEndsAt;
    const delay = cappedDelay(delayRange(1, 8, runner.config.speed), deadline);
    this.scheduleAction(runner, key, delay, async () => {
      const fresh = await this.loadState(runner.sessionId);
      if (fresh.phase !== 'FINAL_LOCK' && fresh.phase !== 'BETTING_LOCKED') return;

      this.log(runner, 'Roll');
      const idempotencyKey = `sim-roll-${fresh.roundId}-${randomUUID()}`;

      try {
        await sessionService.processAction(
          runner.sessionId,
          holderId,
          DICE_ACTIONS.ROLL_DICE,
          { idempotencyKey },
        );
      } catch (err) {
        runner.stats.settlementErrors += 1;
        this.logError(runner, {
          round: fresh.roundNumber,
          phase: fresh.phase,
          player: this.playerName(runner, holderId),
          action: DICE_ACTIONS.ROLL_DICE,
          error: (err as Error).message,
        });
      }
    });
  }

  private async logCompletedRoundFromDb(runner: RunnerContext, roundId: string) {
    const row = await prisma.diceRound.findUnique({ where: { roundId } });
    if (!row) return;

    runner.stats.diceRolls += 1;
    runner.stats.roundsSettled += 1;

    const pool = Number(row.matchedPool ?? 0);
    const fee = Number(row.adminFee ?? 0);
    const payout = Number(row.winnerPayout ?? 0);

    runner.stats.platformFeesGenerated += fee;
    if (row.hasBlank) runner.stats.blankResults += 1;
    if (row.playerChoice === 'ODD' && row.outcome === 'WIN') runner.stats.oddWins += 1;
    if (row.playerChoice === 'EVEN' && row.outcome === 'WIN') runner.stats.evenWins += 1;

    this.log(runner, `Result: ${row.die1} + ${row.die2}`);
    this.log(runner, `Winner: ${this.playerName(runner, row.winnerUserId)}`);
    this.log(runner, `Pool: $${pool}`);
    this.log(runner, `Platform fee: $${fee}`);
    this.log(runner, `Winner payout: $${payout}`);
  }
}

export const diceSimulationService = new DiceSimulationService();
