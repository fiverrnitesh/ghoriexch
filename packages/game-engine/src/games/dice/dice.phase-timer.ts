import type { DiceGameState, DicePhase } from './dice.types.js';

export type PhaseTimerKind =
  | 'OPPONENT_MATCH'
  | 'BETTING_TIMER'
  | 'SIDE_BET'
  | 'INTER_ROUND_PAUSE'
  | 'DICE_HANDOFF'
  | 'FINAL_LOCK';

const PHASES_WITH_DEADLINE: DicePhase[] = [
  'OPPONENT_MATCHING',
  'SIDE_BETTING',
  'INTER_ROUND_PAUSE',
  'DICE_HANDOFF',
  'FINAL_LOCK',
];

export function generatePhaseTimerId(state: DiceGameState, kind: PhaseTimerKind, nowMs = Date.now()): string {
  return `pt_${kind}_${state.roundId}_${state.phase}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clearPhaseTimer(state: DiceGameState): void {
  state.opponentMatchWindowEndsAt = null;
  state.sideBetWindowEndsAt = null;
  state.interRoundPauseEndsAt = null;
  state.diceHandoffEndsAt = null;
  state.finalLockEndsAt = null;
  state.phaseTimerId = null;
}

export function getActivePhaseDeadline(state: DiceGameState): string | null {
  if (state.phase === 'OPPONENT_MATCHING') return state.opponentMatchWindowEndsAt;
  if (state.phase === 'SIDE_BETTING') return state.sideBetWindowEndsAt;
  if (state.phase === 'INTER_ROUND_PAUSE') return state.interRoundPauseEndsAt;
  if (state.phase === 'DICE_HANDOFF') return state.diceHandoffEndsAt;
  if (state.phase === 'FINAL_LOCK') return state.finalLockEndsAt;
  return null;
}

export function getPhaseRemainingMs(state: DiceGameState, nowMs = Date.now()): number {
  const deadline = getActivePhaseDeadline(state);
  if (!deadline) return 0;
  return Math.max(0, new Date(deadline).getTime() - nowMs);
}

export function isPhaseExpired(state: DiceGameState, nowMs = Date.now()): boolean {
  const deadline = getActivePhaseDeadline(state);
  if (!deadline || !PHASES_WITH_DEADLINE.includes(state.phase)) return false;
  return nowMs >= new Date(deadline).getTime();
}

function windowMs(seconds: number, fallbackSeconds: number, nowMs: number): number {
  const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return now + secs * 1000;
}

export function startOpponentMatchWindow(state: DiceGameState, seconds: number, nowMs = Date.now()): void {
  clearPhaseTimer(state);
  state.phase = 'OPPONENT_MATCHING';
  state.opponentMatchWindowEndsAt = new Date(windowMs(seconds, 30, nowMs)).toISOString();
  state.phaseTimerId = generatePhaseTimerId(state, 'OPPONENT_MATCH', nowMs);
}

/** @deprecated Unified betting uses turn timer — kept for legacy session recovery */
export function startSideBetWindow(state: DiceGameState, seconds: number, nowMs = Date.now()): void {
  state.sideBetWindowEndsAt = new Date(windowMs(seconds, 30, nowMs)).toISOString();
  state.phase = 'SIDE_BETTING';
  state.phaseTimerId = generatePhaseTimerId(state, 'SIDE_BET', nowMs);
}

export function startInterRoundPause(state: DiceGameState, seconds: number, nowMs = Date.now()): void {
  clearPhaseTimer(state);
  state.phase = 'INTER_ROUND_PAUSE';
  state.interRoundPauseEndsAt = new Date(windowMs(seconds, 5, nowMs)).toISOString();
  state.phaseTimerId = generatePhaseTimerId(state, 'INTER_ROUND_PAUSE', nowMs);
}

export function startDiceHandoffWindow(state: DiceGameState, seconds: number, nowMs = Date.now()): void {
  clearPhaseTimer(state);
  state.phase = 'DICE_HANDOFF';
  state.diceHandoffEndsAt = new Date(windowMs(seconds, 2, nowMs)).toISOString();
  state.phaseTimerId = generatePhaseTimerId(state, 'DICE_HANDOFF', nowMs);
}

export function startFinalLockWindow(state: DiceGameState, seconds: number, nowMs = Date.now()): void {
  clearPhaseTimer(state);
  state.finalLockEndsAt = new Date(windowMs(seconds, 5, nowMs)).toISOString();
  state.phase = 'FINAL_LOCK';
  state.phaseTimerId = generatePhaseTimerId(state, 'FINAL_LOCK', nowMs);
}

export function getPhaseTimerWsLabel(state: DiceGameState): PhaseTimerKind | null {
  if (state.phase === 'OPPONENT_MATCHING' || state.phase === 'MAIN_BET_PLACED') return 'OPPONENT_MATCH';
  if (state.phase === 'INTER_ROUND_PAUSE') return 'INTER_ROUND_PAUSE';
  if (state.phase === 'DICE_HANDOFF') return 'DICE_HANDOFF';
  if (state.phase === 'FINAL_LOCK') return 'FINAL_LOCK';
  if (state.phase === 'SIDE_BETTING' || state.phase === 'MAIN_MATCH_CONFIRMED') return 'SIDE_BET';
  return null;
}

export function shouldMonitorPhaseTimer(state: DiceGameState): boolean {
  return getPhaseTimerWsLabel(state) !== null;
}
