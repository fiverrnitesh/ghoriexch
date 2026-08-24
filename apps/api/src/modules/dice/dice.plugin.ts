import type { Prisma, GameSession } from '@prisma/client';
import type { GameDefinition, GameEngineEvent, GamePlugin } from '@games/game-engine';
import {
  diceGameEngine,
  DEFAULT_DICE_CONFIG,
  createInitialState,
  DICE_ACTIONS,
  getActiveRollerActorId,
  seatTigerBot,
  startTurnTimer,
  sanitizePublicDiceState,
  type DiceGameState,
  type PlayerChoice,
} from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { diceService } from './dice.service.js';
import {
  recoverActiveTurnTimers,
  scheduleTurnTimer,
  withDiceSessionLock,
} from './dice-turn-timer.scheduler.js';
import {
  recoverActivePhaseTimers,
  schedulePhaseTimer,
  clearPhaseTimerSchedule,
} from './dice-phase-timer.scheduler.js';
import { emitSessionGameEvent } from '../../realtime/socket.server.js';
import { parseAmount } from '../../lib/utils.js';

async function loadState(sessionId: string): Promise<DiceGameState> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { room: true },
  });
  if (!session) throw new Error('Session not found');
  const state = (session.state as unknown as DiceGameState) ?? diceGameEngine.getInternalState(sessionId);
  if (state) {
    diceGameEngine.loadState(sessionId, state);
    applyRoomContext(sessionId, session);
    return state;
  }
  const config = await diceService.getConfig(session.gameId);
  const initial = { ...DEFAULT_DICE_CONFIG, ...config };
  const fresh = createInitialState(initial);
  seatTigerBot(fresh);
  diceGameEngine.loadState(sessionId, fresh);
  applyRoomContext(sessionId, session);
  return fresh;
}

function applyRoomContext(sessionId: string, session: GameSession & { room?: { hostUserId: string | null; metadata: unknown } | null }) {
  const meta = (session.room?.metadata ?? {}) as {
    gameMode?: DiceGameState['gameMode'];
    acceptedParticipantIds?: string[];
  };
  diceGameEngine.configureSessionContext(sessionId, {
    roomHostUserId: session.room?.hostUserId ?? null,
    gameMode: meta.gameMode ?? (session.room?.hostUserId ? 'ONLINE' : null),
    acceptedParticipantIds: meta.acceptedParticipantIds ?? (session.room?.hostUserId ? [session.room.hostUserId] : []),
  });
}

async function syncEngineFromDb(sessionId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { room: true } });
  if (session?.state) {
    diceGameEngine.loadState(sessionId, session.state as unknown as DiceGameState);
    applyRoomContext(sessionId, session);
  }
}

async function saveState(sessionId: string) {
  const state = await diceGameEngine.getState(sessionId);
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { state: state as Prisma.InputJsonValue, status: 'IN_PROGRESS' },
  });
}

function scheduleAllTimers(sessionId: string) {
  void scheduleTurnTimer(sessionId, runBotTurnFromPlugin);
  void schedulePhaseTimer(sessionId, runBotTurnFromPlugin);
}

function emitPublicGameEvent(sessionId: string, action: string, events: GameEngineEvent[]) {
  const internal = diceGameEngine.getInternalState(sessionId);
  if (!internal) return;
  emitSessionGameEvent(sessionId, action, {
    state: sanitizePublicDiceState(internal) as unknown as Record<string, unknown>,
    events: events as unknown[],
  });
}

async function runBotTurn(
  sessionId: string,
  session: GameSession & { game?: { id: string; slug: string } },
) {
  const state = diceGameEngine.getInternalState(sessionId);
  if (!state?.activeMatch) return;

  const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
  const opponentSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);

  if (state.phase === 'BETTING' && !state.mainBet && holderSeat?.occupant?.type === 'BOT') {
    const botId = holderSeat.occupant.botId ?? 'tiger';
    const choice: PlayerChoice = Math.random() > 0.5 ? 'ODD' : 'EVEN';
    const betInput = {
      sessionId,
      userId: botId,
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: state.config.minBet, choice, botAction: true },
    };
    const betResult = await diceGameEngine.processAction(betInput);
    await saveState(sessionId);
    await diceService.handleEngineEvents(session, betResult.events as GameEngineEvent[], betInput);
    await syncEngineFromDb(sessionId);
    emitPublicGameEvent(sessionId, betInput.action, betResult.events as GameEngineEvent[]);
    return;
  }

  if (
    (state.phase === 'OPPONENT_MATCHING' || state.phase === 'MAIN_BET_PLACED') &&
    state.mainBet &&
    !state.mainBet.locked &&
    opponentSeat?.occupant?.type === 'BOT'
  ) {
    const botId = opponentSeat.occupant.botId ?? 'tiger';
    const acceptInput = {
      sessionId,
      userId: botId,
      action: DICE_ACTIONS.ACCEPT_OPPONENT_MATCH,
      payload: { amount: state.mainBet.amount, botAction: true },
    };
    const acceptResult = await diceGameEngine.processAction(acceptInput);
    await saveState(sessionId);
    await diceService.handleEngineEvents(session, acceptResult.events as GameEngineEvent[], acceptInput);
    await syncEngineFromDb(sessionId);
    emitPublicGameEvent(sessionId, acceptInput.action, acceptResult.events as GameEngineEvent[]);
    return;
  }

  const rollerId = getActiveRollerActorId(state);
  const rollerSeat = state.seats.find((s) => {
    const occ = s.occupant;
    if (!occ) return false;
    return occ.type === 'BOT' && (occ.botId === rollerId || rollerId === 'tiger');
  });
  if (
    (state.phase === 'FINAL_LOCK' || state.phase === 'BETTING_LOCKED') &&
    state.mainBet?.locked &&
    rollerSeat?.occupant?.type === 'BOT'
  ) {
    const botId = rollerSeat.occupant.botId ?? 'tiger';
    const rollInput = {
      sessionId,
      userId: botId,
      action: DICE_ACTIONS.ROLL_DICE,
      payload: { botAction: true },
    };
    const rollResult = await diceGameEngine.processAction(rollInput);
    await saveState(sessionId);
    await diceService.handleEngineEvents(session, rollResult.events as GameEngineEvent[], rollInput);
    await syncEngineFromDb(sessionId);
    emitPublicGameEvent(sessionId, rollInput.action, rollResult.events as GameEngineEvent[]);
  }
}

async function processDiceAction(
  input: { sessionId: string; userId: string; action: string; payload: Record<string, unknown> },
  session: GameSession & { game?: { id: string; slug: string } },
) {
  const result = await withDiceSessionLock(input.sessionId, async () => {
    const preAction = diceGameEngine.getInternalState(input.sessionId);
    const hadUnlockedBet =
      input.action === DICE_ACTIONS.PLACE_MAIN_BET &&
      preAction?.phase === 'BETTING' &&
      !preAction.mainBet;
    const acceptMatchFailed = input.action === DICE_ACTIONS.ACCEPT_OPPONENT_MATCH;

    if (input.action === DICE_ACTIONS.ACCEPT_SIDE_BET) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: input.userId } });
      if (wallet) {
        input.payload = {
          ...input.payload,
          availableBalance: parseAmount(wallet.availableBalance.toString()),
        };
      }
    }

    let events;
    try {
      ({ events } = await diceGameEngine.processAction(input));
      await saveState(input.sessionId);
      await diceService.handleEngineEvents(session, events as GameEngineEvent[], input);
    } catch (err) {
      if (acceptMatchFailed || hadUnlockedBet) {
        await loadState(input.sessionId);
        const st = diceGameEngine.getInternalState(input.sessionId);
        if (acceptMatchFailed && st) {
          st.mainBet = null;
          st.phase = 'BETTING';
          clearPhaseTimerSchedule(input.sessionId);
          startTurnTimer(st);
          await saveState(input.sessionId);
        } else if (
          st?.mainBet &&
          !st.mainBet.holderLocked &&
          (st.phase === 'BETTING' || ['MAIN_BET_PLACED', 'OPPONENT_MATCHING'].includes(st.phase))
        ) {
          st.mainBet = null;
          st.phase = 'BETTING';
          clearPhaseTimerSchedule(input.sessionId);
          await saveState(input.sessionId);
        }
      }
      throw err;
    }

    await syncEngineFromDb(input.sessionId);
    await saveState(input.sessionId);
    await runBotTurn(input.sessionId, session);
    await syncEngineFromDb(input.sessionId);
    await saveState(input.sessionId);

    const stateAfter = await diceGameEngine.getState(input.sessionId);
    return { state: stateAfter, events };
  });

  scheduleAllTimers(input.sessionId);
  return result;
}

export function createDicePlugin(): GamePlugin {
  const definition: GameDefinition = {
    meta: diceGameEngine.meta,

    async createSession(input) {
      const config = await diceService.getConfigForRoom(input.roomId);
      const merged = { ...DEFAULT_DICE_CONFIG, ...config };
      const initialState = createInitialState(merged);
      seatTigerBot(initialState as unknown as DiceGameState);
      return { sessionId: '', initialState: initialState as unknown as Record<string, unknown> };
    },

    async joinSession(input) {
      await loadState(input.sessionId);
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      await diceGameEngine.joinSession(input);

      const state = diceGameEngine.getInternalState(input.sessionId)!;
      if (user) {
        const seat = state.seats.find((s) => s.occupant?.userId === input.userId);
        if (seat?.occupant) {
          seat.occupant.name = user.displayName ?? user.username;
          seat.occupant.avatarUrl = user.avatarUrl ?? null;
        }
      }

      await saveState(input.sessionId);
      scheduleAllTimers(input.sessionId);

      const session = await prisma.gameSession.findUnique({
        where: { id: input.sessionId },
        include: { game: true },
      });
      if (session) {
        await runBotTurn(input.sessionId, session);
        scheduleAllTimers(input.sessionId);
      }

      const joinedState = await diceGameEngine.getState(input.sessionId);
      emitSessionGameEvent(input.sessionId, 'JOIN', {
        state: joinedState as Record<string, unknown>,
        events: [],
      });

      return { playerState: { joined: true } };
    },

    async leaveSession(input) {
      await loadState(input.sessionId);
      await diceGameEngine.leaveSession(input);
      await saveState(input.sessionId);
    },

    async processAction(input) {
      await loadState(input.sessionId);
      const session = await prisma.gameSession.findUnique({
        where: { id: input.sessionId },
        include: { game: true },
      });
      if (!session) throw new Error('Session not found');
      return processDiceAction(input, session);
    },

    async getState(sessionId) {
      await loadState(sessionId);
      scheduleAllTimers(sessionId);
      return diceGameEngine.getState(sessionId);
    },

    async settleRound(sessionId) {
      await loadState(sessionId);
      return diceGameEngine.settleRound(sessionId);
    },
  };

  return { definition };
}

export const dicePlugin = createDicePlugin();

export async function initializeDiceTurnTimers() {
  await recoverActiveTurnTimers(runBotTurnFromPlugin);
  await recoverActivePhaseTimers(runBotTurnFromPlugin);
}

export async function ensureDiceTurnTimer(sessionId: string) {
  await scheduleTurnTimer(sessionId, runBotTurnFromPlugin);
  await schedulePhaseTimer(sessionId, runBotTurnFromPlugin);
}

async function runBotTurnFromPlugin(
  sessionId: string,
  session: GameSession & { game?: { id: string; slug: string } },
) {
  await runBotTurn(sessionId, session);
}
