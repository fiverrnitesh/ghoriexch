import type { Prisma, GameSession } from '@prisma/client';
import type { GameEngineEvent } from '@games/game-engine';
import {
  diceGameEngine,
  DICE_ACTIONS,
  getPhaseRemainingMs,
  getPhaseTimerWsLabel,
  isPhaseExpired,
  sanitizePublicDiceState,
  shouldMonitorPhaseTimer,
  type DiceGameState,
} from '@games/game-engine';
import { prisma } from '../../database/client.js';
import { diceService } from './dice.service.js';
import { emitGameTimer, emitSessionGameEvent, getRealtimeServer } from '../../realtime/socket.server.js';
import { areDiceTimersEnabled, scheduleTurnTimer, withDiceSessionLock } from './dice-turn-timer.scheduler.js';

type BotTurnFn = (
  sessionId: string,
  session: GameSession & { game?: { id: string; slug: string } },
) => Promise<void>;

type PhaseTimerHandle = {
  phaseTimerId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  tickId: ReturnType<typeof setInterval>;
  runBotTurn?: BotTurnFn;
};

const phaseTimerHandles = new Map<string, PhaseTimerHandle>();

function isSchedulerDbGone(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /not yet connected|Engine is not yet|Response from the Engine was empty|Can't reach database/i.test(msg);
}

export function clearPhaseTimerSchedule(sessionId: string) {
  const handle = phaseTimerHandles.get(sessionId);
  if (handle) {
    clearTimeout(handle.timeoutId);
    clearInterval(handle.tickId);
    phaseTimerHandles.delete(sessionId);
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

async function processPhaseTimeout(
  sessionId: string,
  expectedPhaseTimerId: string,
  runBotTurn?: BotTurnFn,
) {
  if (!areDiceTimersEnabled()) return;
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
    if (!state || state.phaseTimerId !== expectedPhaseTimerId) return;
    if (!isPhaseExpired(state)) return;

    clearPhaseTimerSchedule(sessionId);

    const input = {
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.PHASE_TIMEOUT,
      payload: { phaseTimerId: expectedPhaseTimerId, systemTimeout: true },
    };
    const { events } = await diceGameEngine.processAction(input);
    if (events.length === 0) return;

    await saveState(sessionId);
    await diceService.handleEngineEvents(session, events as GameEngineEvent[], input);
    const publicState = sanitizePublicDiceState(diceGameEngine.getInternalState(sessionId)!);
    emitSessionGameEvent(sessionId, DICE_ACTIONS.PHASE_TIMEOUT, {
      state: publicState as unknown as Record<string, unknown>,
      events: events as unknown[],
    });
    sessionForResume = session;
    advanced = true;
    } catch (err) {
      if (!isSchedulerDbGone(err)) throw err;
    }
  });

  if (!areDiceTimersEnabled()) return;

  if (!advanced) {
    await schedulePhaseTimer(sessionId, runBotTurn);
    await scheduleTurnTimer(sessionId, runBotTurn);
    return;
  }

  await scheduleTurnTimer(sessionId, runBotTurn);
  await schedulePhaseTimer(sessionId, runBotTurn);
  if (runBotTurn && sessionForResume) {
    try {
      await runBotTurn(sessionId, sessionForResume);
    } catch (err) {
      console.error('[dice] bot turn after phase timeout failed', sessionId, err);
    }
    await scheduleTurnTimer(sessionId, runBotTurn);
    await schedulePhaseTimer(sessionId, runBotTurn);
  }
}

export function schedulePhaseTimer(sessionId: string, runBotTurn?: BotTurnFn): Promise<void> {
  if (!areDiceTimersEnabled()) return Promise.resolve();
  return withDiceSessionLock(sessionId, async () => {
    try {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });
    if (!session?.game || session.game.slug !== 'dice') return;

    const loaded = await loadState(sessionId);
    if (!loaded) return;
    const state = diceGameEngine.getInternalState(sessionId);
    if (!state || !shouldMonitorPhaseTimer(state) || !state.phaseTimerId) {
      clearPhaseTimerSchedule(sessionId);
      return;
    }

    const phaseTimerId = state.phaseTimerId;
    const existing = phaseTimerHandles.get(sessionId);
    if (existing?.phaseTimerId === phaseTimerId) {
      existing.runBotTurn = runBotTurn ?? existing.runBotTurn;
      return;
    }

    clearPhaseTimerSchedule(sessionId);

    const fire = () => {
      void processPhaseTimeout(sessionId, phaseTimerId, runBotTurn).catch((err) => {
        if (!isSchedulerDbGone(err)) {
          console.error(`[dice-phase-timer] session ${sessionId}:`, err);
        }
        clearPhaseTimerSchedule(sessionId);
      });
    };

    const remainingMs = getPhaseRemainingMs(state);
    const io = getRealtimeServer();

    const emitTick = () => {
      const current = diceGameEngine.getInternalState(sessionId);
      if (!current || current.phaseTimerId !== phaseTimerId) return;
      const rem = getPhaseRemainingMs(current);
      const label = getPhaseTimerWsLabel(current);
      if (io && label) {
        emitGameTimer(io, sessionId, { phase: label, remainingMs: rem });
      }
    };

    emitTick();

    if (remainingMs <= 0) {
      if (isPhaseExpired(state)) fire();
      return;
    }

    const timeoutId = setTimeout(fire, remainingMs);
    const tickId = setInterval(emitTick, 1000);
    phaseTimerHandles.set(sessionId, { phaseTimerId, timeoutId, tickId, runBotTurn });
    } catch (err) {
      if (!isSchedulerDbGone(err)) throw err;
    }
  });
}

export async function recoverActivePhaseTimers(runBotTurn?: BotTurnFn) {
  if (!areDiceTimersEnabled()) return;
  try {
    const sessions = await prisma.gameSession.findMany({
      where: { status: { in: ['WAITING', 'IN_PROGRESS'] }, game: { slug: 'dice' } },
      include: { game: true },
    });

    for (const session of sessions) {
      const state = session.state as unknown as DiceGameState | null;
      if (!state?.phaseTimerId || !shouldMonitorPhaseTimer(state)) continue;
      diceGameEngine.loadState(session.id, state);
      void schedulePhaseTimer(session.id, runBotTurn);
    }
  } catch (err) {
    if (!isSchedulerDbGone(err)) throw err;
  }
}

export function resetPhaseTimerSchedulerForTests() {
  for (const sessionId of [...phaseTimerHandles.keys()]) {
    clearPhaseTimerSchedule(sessionId);
  }
}
