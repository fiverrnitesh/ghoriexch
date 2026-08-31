import type { Prisma, GameSession } from '@prisma/client';
import type { GameEngineEvent } from '@games/game-engine';
import {
  diceGameEngine,
  DICE_ACTIONS,
  getTurnRemainingMs,
  isTurnExpired,
  shouldMonitorTurnTimer,
  startTurnTimer,
  sanitizePublicDiceState,
  type DiceGameState,
} from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { diceService } from './dice.service.js';
import { emitGameTimer, emitSessionGameEvent, getRealtimeServer } from '../../realtime/socket.server.js';

type TurnTimerHandle = {
  turnTimerId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  tickId: ReturnType<typeof setInterval>;
};

const turnTimerHandles = new Map<string, TurnTimerHandle>();
const sessionLockTails = new Map<string, Promise<void>>();
let diceTimersEnabled = true;

function isSchedulerDbGone(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /not yet connected|Engine is not yet|Response from the Engine was empty|Can't reach database/i.test(msg);
}

export function setDiceTimersEnabled(enabled: boolean) {
  diceTimersEnabled = enabled;
}

export function areDiceTimersEnabled() {
  return diceTimersEnabled;
}

export async function withDiceSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLockTails.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  sessionLockTails.set(sessionId, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function clearTurnTimerSchedule(sessionId: string) {
  const handle = turnTimerHandles.get(sessionId);
  if (handle) {
    clearTimeout(handle.timeoutId);
    clearInterval(handle.tickId);
    turnTimerHandles.delete(sessionId);
  }
}

async function loadState(sessionId: string): Promise<DiceGameState | null> {
  try {
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    const state = session.state as unknown as DiceGameState;
    diceGameEngine.loadState(sessionId, state);
    return state;
  } catch (err) {
    if (isSchedulerDbGone(err)) return null;
    throw err;
  }
}

async function saveState(sessionId: string) {
  try {
    const state = await diceGameEngine.getState(sessionId);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { state: state as Prisma.InputJsonValue, status: 'IN_PROGRESS' },
    });
  } catch (err) {
    if (!isSchedulerDbGone(err)) throw err;
  }
}

async function processTimeoutAction(
  sessionId: string,
  session: GameSession & { game?: { id: string; slug: string } },
  turnTimerId: string,
) {
  const input = {
    sessionId,
    userId: 'system',
    action: DICE_ACTIONS.TURN_TIMEOUT,
    payload: { turnTimerId, systemTimeout: true },
  };
  const { events } = await diceGameEngine.processAction(input);
  if (events.length === 0) return null;

  await saveState(sessionId);
  await diceService.handleEngineEvents(session, events as GameEngineEvent[], input);

  const state = await diceGameEngine.getState(sessionId);
  emitSessionGameEvent(sessionId, DICE_ACTIONS.TURN_TIMEOUT, {
    state: sanitizePublicDiceState(diceGameEngine.getInternalState(sessionId)!) as unknown as Record<string, unknown>,
    events: events as unknown[],
  });
  return { state, events };
}

export async function handleTurnTimeout(
  sessionId: string,
  expectedTurnTimerId: string,
  runBotTurn?: (sessionId: string, session: GameSession & { game?: { id: string; slug: string } }) => Promise<void>,
) {
  if (!diceTimersEnabled) return;
  let sessionForResume: (GameSession & { game?: { id: string; slug: string } }) | null = null;
  let advanced = false;

  await withDiceSessionLock(sessionId, async () => {
    try {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });
    if (!session?.game) return;

    const loaded = await loadState(sessionId);
    if (!loaded) return;
    const state = diceGameEngine.getInternalState(sessionId);
    if (!state || state.turnTimerId !== expectedTurnTimerId) return;
    if (!isTurnExpired(state)) return;

    clearTurnTimerSchedule(sessionId);
    const result = await processTimeoutAction(sessionId, session, expectedTurnTimerId);
    if (!result) return;

    sessionForResume = session;
    advanced = true;
    await saveState(sessionId);
    } catch (err) {
      if (!isSchedulerDbGone(err)) throw err;
    }
  });

  if (!advanced) return;
  await resumeClock(sessionId, runBotTurn, sessionForResume);
}

export function scheduleTurnTimer(
  sessionId: string,
  runBotTurn?: (sessionId: string, session: GameSession & { game?: { id: string; slug: string } }) => Promise<void>,
): Promise<void> {
  if (!diceTimersEnabled) return Promise.resolve();
  return withDiceSessionLock(sessionId, async () => {
    try {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });
    if (!session?.game || session.game.slug !== 'dice') return;

    const loaded = await loadState(sessionId);
    if (!loaded) return;
    let state = diceGameEngine.getInternalState(sessionId);
    if (!state || !shouldMonitorTurnTimer(state)) {
      clearTurnTimerSchedule(sessionId);
      return;
    }

    if (!state.turnDeadlineAt || !state.turnTimerId) {
      startTurnTimer(state);
      await saveState(sessionId);
      state = diceGameEngine.getInternalState(sessionId)!;
    }

    if (!state.turnTimerId || !state.turnDeadlineAt) {
      clearTurnTimerSchedule(sessionId);
      return;
    }

    const turnTimerId = state.turnTimerId;
    const existing = turnTimerHandles.get(sessionId);
    if (existing?.turnTimerId === turnTimerId) return;

    clearTurnTimerSchedule(sessionId);

    const fire = () => {
      void handleTurnTimeout(sessionId, turnTimerId, runBotTurn).catch((err) => {
        if (!isSchedulerDbGone(err)) {
          console.error(`[dice-turn-timer] session ${sessionId}:`, err);
        }
        clearTurnTimerSchedule(sessionId);
      });
    };

    const remainingMs = getTurnRemainingMs(state);
    const io = getRealtimeServer();

    const emitTick = () => {
      const current = diceGameEngine.getInternalState(sessionId);
      if (!current || current.turnTimerId !== turnTimerId) return;
      const rem = getTurnRemainingMs(current);
      if (io) {
        const phase = current.phase === 'BETTING' ? 'BETTING_TIMER' : 'PLAYER_TURN';
        emitGameTimer(io, sessionId, { phase, remainingMs: rem });
      }
    };

    emitTick();

    if (remainingMs <= 0) {
      if (isTurnExpired(state)) fire();
      return;
    }

    const timeoutId = setTimeout(fire, remainingMs);
    const tickId = setInterval(emitTick, 1000);
    turnTimerHandles.set(sessionId, { turnTimerId, timeoutId, tickId });

    const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
    const tigerShouldBet =
      !!runBotTurn &&
      holderSeat?.occupant?.type === 'BOT' &&
      state.phase === 'BETTING' &&
      !state.mainBet;

    if (tigerShouldBet) {
      try {
        await runBotTurn(sessionId, session);
      } catch (err) {
        console.error('[dice] bot turn scheduling failed', sessionId, err);
      }
      await saveState(sessionId);
    }
    } catch (err) {
      if (!isSchedulerDbGone(err)) throw err;
    }
  });
}

async function resumeClock(
  sessionId: string,
  runBotTurn?: (sessionId: string, session: GameSession & { game?: { id: string; slug: string } }) => Promise<void>,
  session?: (GameSession & { game?: { id: string; slug: string } }) | null,
) {
  if (!diceTimersEnabled) return;
  try {
    const { schedulePhaseTimer } = await import('./dice-phase-timer.scheduler.js');
    await scheduleTurnTimer(sessionId, runBotTurn);
    await schedulePhaseTimer(sessionId, runBotTurn);
    if (runBotTurn && session) {
      try {
        await runBotTurn(sessionId, session);
      } catch (err) {
        console.error('[dice] bot turn after timeout failed', sessionId, err);
      }
      await scheduleTurnTimer(sessionId, runBotTurn);
      await schedulePhaseTimer(sessionId, runBotTurn);
    }
  } catch (err) {
    if (!isSchedulerDbGone(err)) throw err;
  }
}

export async function recoverActiveTurnTimers(
  runBotTurn?: (sessionId: string, session: GameSession & { game?: { id: string; slug: string } }) => Promise<void>,
) {
  if (!diceTimersEnabled) return;
  try {
    const sessions = await prisma.gameSession.findMany({
      where: { status: { in: ['WAITING', 'IN_PROGRESS'] }, game: { slug: 'dice' } },
      include: { game: true },
    });

    for (const session of sessions) {
      const state = session.state as unknown as DiceGameState | null;
      if (!state?.turnDeadlineAt || !shouldMonitorTurnTimer(state)) continue;
      diceGameEngine.loadState(session.id, state);
      void scheduleTurnTimer(session.id, runBotTurn);
    }
  } catch (err) {
    if (!isSchedulerDbGone(err)) throw err;
  }
}

export async function drainDiceSessionLocks() {
  for (let i = 0; i < 4; i++) {
    const tails = [...sessionLockTails.values()];
    if (tails.length === 0) break;
    await Promise.all(tails.map((p) => p.catch(() => undefined)));
  }
}

export function resetTurnTimerSchedulerForTests() {
  for (const sessionId of [...turnTimerHandles.keys()]) {
    clearTurnTimerSchedule(sessionId);
  }
}

export async function shutdownDiceSchedulersForTests() {
  diceTimersEnabled = false;
  resetTurnTimerSchedulerForTests();
  const { resetPhaseTimerSchedulerForTests } = await import('./dice-phase-timer.scheduler.js');
  resetPhaseTimerSchedulerForTests();
  await drainDiceSessionLocks();
  resetTurnTimerSchedulerForTests();
  resetPhaseTimerSchedulerForTests();
  sessionLockTails.clear();
}
