import { prisma } from '../../database/client.js';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { authService } from '../auth/auth.service.js';
import { sessionService } from '../sessions/session.service.js';
import { roomService } from '../rooms/room.service.js';
import { diceService } from './dice.service.js';
import { emitSessionGameEvent } from '../../realtime/socket.server.js';
import {
  DEMO_ADMIN,
  DEMO_DEV_PASSWORD,
  DEMO_PLAYERS,
  DEMO_PRESETS,
  DEMO_ROOM_CODE,
  DEMO_ROOM_NAME,
  type DemoPreset,
  demoAvatarUrl,
} from './dice-demo.constants.js';
import {
  buildInitialMatch,
  clearPhaseTimer,
  countOccupants,
  diceGameEngine,
  generateRoundId,
  shouldAddTigerBot,
  startTurnTimer,
  DEFAULT_DICE_CONFIG,
  DICE_ACTIONS,
  getActiveHolderActorId,
  isEligibleSideBettor,
  type DiceGameState,
} from '@games/game-engine';
import { ensureDiceTurnTimer } from './dice.plugin.js';
import { clearPhaseTimerSchedule } from './dice-phase-timer.scheduler.js';
import { clearTurnTimerSchedule } from './dice-turn-timer.scheduler.js';

export class DiceDemoService {
  assertDevEnabled() {
    if (!env.isDev) {
      throw new ForbiddenError('Demo tools are only available in development mode');
    }
  }

  getStatus() {
    this.assertDevEnabled();
    return {
      enabled: true,
      sandbox: env.wallet.sandboxMode,
      passwordHint: DEMO_DEV_PASSWORD,
      demoRoom: { code: DEMO_ROOM_CODE, name: DEMO_ROOM_NAME },
      players: DEMO_PLAYERS.map((p) => ({
        email: p.email,
        username: p.username,
        displayName: p.displayName,
        balance: p.balance,
        avatarUrl: demoAvatarUrl(p.avatarSeed),
      })),
      admin: DEMO_ADMIN,
      presets: Object.keys(DEMO_PRESETS),
    };
  }

  async demoLogin(email: string) {
    this.assertDevEnabled();
    const allowed = [...DEMO_PLAYERS.map((p) => p.email), DEMO_ADMIN.email, 'superadmin@games.local'];
    if (!allowed.includes(email.toLowerCase())) {
      throw new ValidationError('Not a demo account');
    }
    return authService.login({ email, password: DEMO_DEV_PASSWORD });
  }

  async getOrCreateDemoRoom(hostUserId: string) {
    this.assertDevEnabled();
    const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
    if (!game) throw new NotFoundError('Dice game not available');

    let room = await prisma.room.findUnique({
      where: { code: DEMO_ROOM_CODE },
      include: {
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!room) {
      room = await prisma.room.create({
        data: {
          gameId: game.id,
          hostUserId,
          name: DEMO_ROOM_NAME,
          code: DEMO_ROOM_CODE,
          maxPlayers: game.maxPlayers,
          minBet: game.minBet,
          maxBet: game.maxBet,
          status: 'OPEN',
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
      const session = await sessionService.createSession('dice', hostUserId, room.id);
      sessionId = session.id;
      await sessionService.joinSession(sessionId, hostUserId);
    }

    const session = await sessionService.joinSession(sessionId, hostUserId);
    const publicState = await diceService.getPublicState(sessionId);

    return {
      ...publicState,
      room: await roomService.getByCode(DEMO_ROOM_CODE),
      session,
    };
  }

  async fillSession(sessionId: string, preset: DemoPreset) {
    this.assertDevEnabled();
    const emails = DEMO_PRESETS[preset];
    if (!emails) throw new ValidationError('Invalid demo preset');

    const users = await prisma.user.findMany({
      where: { email: { in: [...emails] } },
    });

    for (const email of emails) {
      const user = users.find((u) => u.email === email);
      if (!user) continue;
      try {
        await sessionService.joinSession(sessionId, user.id);
      } catch {
        // already joined or full — continue
      }
    }

    // For capped presets (e.g. '6'), vacate any seated users not in the allowed set.
    // This prevents ghost players from a previous "Add Demo Players" / "Full Table".
    const MAX_VISUAL_HUMANS = 5; // 5 real + Shoot = 6 visual slots
    if (emails.length <= MAX_VISUAL_HUMANS) {
      const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
      if (session) {
        const allowedUserIds = new Set(users.map((u) => u.id));
        // Also keep the current logged-in host / whoever created the session
        const state = session.state as unknown as DiceGameState;
        if (state?.roomHostUserId) allowedUserIds.add(state.roomHostUserId);
        // Keep the current session's player who triggered this
        diceGameEngine.loadState(sessionId, state);
        const engineState = diceGameEngine.getInternalState(sessionId)!;
        let changed = false;
        for (const seat of engineState.seats) {
          if (!seat.occupant || seat.occupant.type !== 'USER') continue;
          if (seat.occupant.userId && !allowedUserIds.has(seat.occupant.userId)) {
            seat.occupant = null;
            changed = true;
          }
        }
        if (changed) {
          diceGameEngine.loadState(sessionId, engineState);
          await prisma.gameSession.update({
            where: { id: sessionId },
            data: { state: engineState as unknown as Prisma.InputJsonValue },
          });
        }
      }
    }

    const publicState = await diceService.getPublicState(sessionId);
    emitSessionGameEvent(sessionId, 'DEMO_FILL', {
      state: publicState.state as unknown as Record<string, unknown>,
      events: [],
    });
    return publicState;
  }

  async addDemoPlayers(sessionId: string) {
    this.assertDevEnabled();
    const MAX_VISIBLE = 6; // 5 real + Shoot = 6 visual slots

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    const currentState = session?.state as unknown as DiceGameState | undefined;
    const currentOccupied = currentState ? countOccupants(currentState.seats) : 0;

    const emails = DEMO_PLAYERS.map((p) => p.email);
    const users = await prisma.user.findMany({ where: { email: { in: [...emails] } } });

    let added = 0;
    for (const email of emails) {
      if (currentOccupied + added >= MAX_VISIBLE) break;
      const user = users.find((u) => u.email === email);
      if (!user) continue;
      try {
        await sessionService.joinSession(sessionId, user.id);
        added++;
      } catch {
        // already joined or full
      }
    }

    return diceService.getPublicState(sessionId);
  }

  async startRound(sessionId: string) {
    this.assertDevEnabled();
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session not found');

    let state = (session.state as unknown as DiceGameState) ?? diceGameEngine.getInternalState(sessionId);
    if (!state) throw new NotFoundError('Dice state not found');

    diceGameEngine.loadState(sessionId, state);
    state = diceGameEngine.getInternalState(sessionId)!;

    if (shouldAddTigerBot(state.seats, state.maxSeats)) {
      state.seats = state.seats.map((s) => ({ ...s, occupant: s.occupant ? { ...s.occupant } : null }));
      const empty = state.seats.find((s) => !s.occupant);
      if (empty) {
        empty.occupant = {
          type: 'BOT',
          botId: 'tiger',
          name: DEFAULT_DICE_CONFIG.botName,
          avatarUrl: null,
        };
      }
    }

    // Cap to 6 visible occupants (5 real + Shoot) — vacate extras so rotation
    // only cycles among players actually rendered on the visual table.
    const MAX_VISIBLE = 6;
    const occupied = state.seats.filter((s) => s.occupant);
    if (occupied.length > MAX_VISIBLE) {
      const tigerIdx = occupied.findIndex((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger');
      const hostIdx = state.roomHostUserId
        ? occupied.findIndex((s) => s.occupant?.type === 'USER' && s.occupant.userId === state.roomHostUserId)
        : -1;
      const keep = new Set<number>();
      if (tigerIdx >= 0) keep.add(occupied[tigerIdx]!.seatIndex);
      if (hostIdx >= 0) keep.add(occupied[hostIdx]!.seatIndex);
      for (const s of occupied) {
        if (keep.size >= MAX_VISIBLE) break;
        if (!keep.has(s.seatIndex)) keep.add(s.seatIndex);
      }
      for (const s of state.seats) {
        if (s.occupant && !keep.has(s.seatIndex)) s.occupant = null;
      }
    }

    if (countOccupants(state.seats) < state.config.minEffectivePopulation) {
      throw new ValidationError('Need at least 2 seated players to start a round');
    }

    const match = buildInitialMatch(state.seats, state.roomHostUserId ?? null);
    if (!match) throw new ValidationError('Could not form a holder vs opponent match');

    clearPhaseTimerSchedule(sessionId);
    clearTurnTimerSchedule(sessionId);

    state.activeMatch = match;
    state.roundNumber += 1;
    state.roundId = generateRoundId();
    state.mainBet = null;
    state.dice = null;
    state.sideBets = [];
    state.forcedDice = null;
    state.phase = 'BETTING';
    state.rollerSeatIndex = match.holderSeatIndex;
    state.sideBetWindowEndsAt = null;
    state.finalLockEndsAt = null;
    state.opponentMatchWindowEndsAt = null;
    clearPhaseTimer(state);
    startTurnTimer(state, Date.now());

    diceGameEngine.loadState(sessionId, state);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        state: state as unknown as Prisma.InputJsonValue,
        status: 'IN_PROGRESS',
      },
    });

    await ensureDiceTurnTimer(sessionId);

    const publicState = await diceService.getPublicState(sessionId);
    emitSessionGameEvent(sessionId, 'DEMO_START_ROUND', {
      state: publicState.state as unknown as Record<string, unknown>,
      events: [{ type: 'dice:rotation', payload: { activeMatch: match, reason: 'demo_start' } }],
    });
    return publicState;
  }

  async resetDemoBalances() {
    this.assertDevEnabled();
    for (const p of DEMO_PLAYERS) {
      const user = await prisma.user.findUnique({ where: { email: p.email } });
      if (!user) continue;
      await prisma.wallet.updateMany({
        where: { userId: user.id },
        data: {
          balance: p.balance,
          availableBalance: p.balance,
          lockedBalance: 0,
          currency: 'USD',
        },
      });
    }
    return { reset: DEMO_PLAYERS.length, currency: 'USD' };
  }

  async resetSessionTable(sessionId: string, hostUserId: string) {
    this.assertDevEnabled();
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { room: true },
    });
    if (!session?.roomId) throw new NotFoundError('Session or room not found');

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });

    const newSession = await sessionService.createSession('dice', hostUserId, session.roomId);
    await sessionService.joinSession(newSession.id, hostUserId);

    return diceService.getPublicState(newSession.id);
  }

  async forceMainBet(sessionId: string) {
    this.assertDevEnabled();
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session not found');

    diceGameEngine.loadState(sessionId, session.state as unknown as DiceGameState);
    const state = diceGameEngine.getInternalState(sessionId);
    if (!state?.activeMatch) throw new ValidationError('No active match — Force Start Round first');
    if (state.phase !== 'BETTING') throw new ValidationError(`Betting not open (${state.phase})`);
    if (state.mainBet) throw new ValidationError('Main bet already placed');

    const holderId = getActiveHolderActorId(state);
    if (!holderId) throw new ValidationError('No holder to place a bet');
    const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch?.holderSeatIndex);
    const isBot = holderSeat?.occupant?.type === 'BOT';

    return sessionService.processAction(sessionId, holderId, DICE_ACTIONS.PLACE_MAIN_BET, {
      amount: 100,
      choice: 'EVEN',
      botAction: isBot || undefined,
      idempotencyKey: `demo-force-main-${state.roundId}-${Date.now()}`,
    });
  }

  async simulateSideBet(sessionId: string) {
    this.assertDevEnabled();
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundError('Session not found');

    diceGameEngine.loadState(sessionId, session.state as unknown as DiceGameState);
    let state = diceGameEngine.getInternalState(sessionId);
    if (!state?.activeMatch) throw new ValidationError('No active match — Force Start Round first');
    if (!state.mainBet) throw new ValidationError('Place a main bet first (Force Main Bet)');
    if (state.phase !== 'BETTING' && state.phase !== 'SIDE_BETTING') {
      throw new ValidationError(`Side betting not open (${state.phase})`);
    }

    const rahul = await prisma.user.findUnique({ where: { email: 'rahul@games.local' } });
    if (!rahul) throw new NotFoundError('Rahul demo user not found');
    try {
      await sessionService.joinSession(sessionId, rahul.id);
    } catch {
      // already seated or table full
    }

    const reloaded = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    diceGameEngine.loadState(sessionId, reloaded!.state as unknown as DiceGameState);
    state = diceGameEngine.getInternalState(sessionId)!;

    let backerId = rahul.id;
    if (!isEligibleSideBettor(state, backerId)) {
      const holderId = getActiveHolderActorId(state);
      const opponent = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
      const opponentUserId = opponent?.occupant?.type === 'USER' ? opponent.occupant.userId : null;
      const spectator = state.seats.find((s) => {
        const occ = s.occupant;
        return occ?.type === 'USER' && occ.userId && occ.userId !== holderId && occ.userId !== opponentUserId;
      });
      if (!spectator?.occupant || spectator.occupant.type !== 'USER' || !spectator.occupant.userId) {
        throw new ValidationError('No seated spectator available for a side bet');
      }
      backerId = spectator.occupant.userId;
    }

    const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
    const occ = holderSeat?.occupant;
    const targetUserId = occ?.type === 'BOT'
      ? `player_${occ.botId ?? 'tiger'}`
      : (occ?.userId ?? 'player_tiger');

    return sessionService.processAction(sessionId, backerId, DICE_ACTIONS.REQUEST_SIDE_BET, {
      targetUserId,
      prediction: 'WIN',
      amount: 50,
      sideBetId: `demo-sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    });
  }
}

export const diceDemoService = new DiceDemoService();
