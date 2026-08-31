import type { DiceGameState } from '@games/game-engine/browser';

/** Display-only countdown derived from authoritative server turnDeadlineAt. */
export function getRemainingSecondsFromDeadline(
  deadlineIso: string | null | undefined,
  nowMs = Date.now(),
): number | undefined {
  if (!deadlineIso) return undefined;
  const ms = new Date(deadlineIso).getTime() - nowMs;
  if (Number.isNaN(ms)) return undefined;
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatTurnCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function shouldShowTurnCountdown(
  state: Pick<DiceGameState, 'phase' | 'turnDeadlineAt' | 'activeMatch' | 'mainBet'> | null | undefined,
): boolean {
  if (!state?.activeMatch || !state.turnDeadlineAt) return false;
  return state.phase === 'BETTING';
}

export function getPhaseDeadlineIso(
  state: Pick<
    DiceGameState,
    | 'phase'
    | 'opponentMatchWindowEndsAt'
    | 'sideBetWindowEndsAt'
    | 'interRoundPauseEndsAt'
    | 'diceHandoffEndsAt'
    | 'finalLockEndsAt'
  > | null | undefined,
): string | null | undefined {
  if (!state) return undefined;
  if (state.phase === 'OPPONENT_MATCHING' || state.phase === 'MAIN_BET_PLACED') {
    return state.opponentMatchWindowEndsAt;
  }
  if (state.phase === 'INTER_ROUND_PAUSE') {
    return state.interRoundPauseEndsAt;
  }
  if (state.phase === 'DICE_HANDOFF') return state.diceHandoffEndsAt;
  if (state.phase === 'FINAL_LOCK') return state.finalLockEndsAt;
  return undefined;
}

export function getPhaseRemainingSeconds(
  state: Pick<
    DiceGameState,
    | 'phase'
    | 'opponentMatchWindowEndsAt'
    | 'sideBetWindowEndsAt'
    | 'interRoundPauseEndsAt'
    | 'diceHandoffEndsAt'
    | 'finalLockEndsAt'
  > | null | undefined,
  nowMs = Date.now(),
): number | undefined {
  return getRemainingSecondsFromDeadline(getPhaseDeadlineIso(state), nowMs);
}

/** @deprecated use getPhaseRemainingSeconds */
export function getSideBetRemainingSeconds(
  sideBetWindowEndsAt: string | null | undefined,
  nowMs = Date.now(),
): number | undefined {
  return getRemainingSecondsFromDeadline(sideBetWindowEndsAt, nowMs);
}
