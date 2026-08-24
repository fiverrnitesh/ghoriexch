import type { DiceGameState } from './dice.types.js';

export function getTurnTimeoutMs(state: DiceGameState): number {
  const seconds = (state.config as DiceGameState['config'] & { turnTimeoutSeconds?: number }).turnTimeoutSeconds
    ?? 15;
  return seconds * 1000;
}

export function generateTurnTimerId(state: DiceGameState, nowMs = Date.now()): string {
  const holderSeat = state.activeMatch?.holderSeatIndex ?? 'x';
  return `tt_${state.roundId}_${holderSeat}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Full 15s betting window — stays armed after the main bet so backing bets can close. */
export function shouldMonitorTurnTimer(state: DiceGameState): boolean {
  if (!state.activeMatch) return false;
  return state.phase === 'BETTING';
}

export function startTurnTimer(state: DiceGameState, nowMs = Date.now()): void {
  if (!shouldMonitorTurnTimer(state)) {
    clearTurnTimer(state);
    return;
  }
  const startedAt = new Date(nowMs).toISOString();
  const deadlineAt = new Date(nowMs + getTurnTimeoutMs(state)).toISOString();
  state.turnStartedAt = startedAt;
  state.turnDeadlineAt = deadlineAt;
  state.turnTimerId = generateTurnTimerId(state, nowMs);
}

export function clearTurnTimer(state: DiceGameState): void {
  state.turnStartedAt = null;
  state.turnDeadlineAt = null;
  state.turnTimerId = null;
}

export function getTurnRemainingMs(state: DiceGameState, nowMs = Date.now()): number {
  if (!state.turnDeadlineAt) return 0;
  return Math.max(0, new Date(state.turnDeadlineAt).getTime() - nowMs);
}

export function isTurnExpired(state: DiceGameState, nowMs = Date.now()): boolean {
  if (!state.turnDeadlineAt || !shouldMonitorTurnTimer(state)) return false;
  return nowMs >= new Date(state.turnDeadlineAt).getTime();
}

export function assertTurnNotExpired(state: DiceGameState, nowMs = Date.now()): void {
  if (isTurnExpired(state, nowMs)) {
    throw new Error('Turn deadline expired');
  }
}
