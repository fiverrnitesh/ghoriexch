import type { DiceGameState } from '@games/game-engine/browser';

export type PhaseTimerKind = 'OPPONENT_MATCH' | 'BETTING_TIMER' | 'INTER_ROUND_PAUSE' | 'DICE_HANDOFF' | 'FINAL_LOCK' | 'PLAYER_TURN' | 'SIDE_BET';

export function getPhaseTimerKindFromState(
  state: Pick<DiceGameState, 'phase' | 'turnDeadlineAt'> | null | undefined,
): PhaseTimerKind | null {
  if (!state) return null;
  if (state.phase === 'OPPONENT_MATCHING' || state.phase === 'MAIN_BET_PLACED') return 'OPPONENT_MATCH';
  if (state.phase === 'INTER_ROUND_PAUSE') return 'INTER_ROUND_PAUSE';
  if (state.phase === 'DICE_HANDOFF') return 'DICE_HANDOFF';
  if (state.phase === 'BETTING' && state.turnDeadlineAt) return 'BETTING_TIMER';
  if (state.phase === 'FINAL_LOCK') return 'FINAL_LOCK';
  return null;
}

export function isDiceHandoffPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'DICE_HANDOFF';
}

export function isRollReadyPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'FINAL_LOCK' || state?.phase === 'BETTING_LOCKED';
}

export function isRollerHandoffOrRollPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return isDiceHandoffPhase(state) || isRollReadyPhase(state);
}

export function isSideBettingPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'BETTING';
}

export function isAcceptancePhase(_state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return false;
}

export function isBettingPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'BETTING';
}

export function isInterRoundPause(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'INTER_ROUND_PAUSE';
}

export function isOpponentMatchPhase(state: Pick<DiceGameState, 'phase'> | null | undefined): boolean {
  return state?.phase === 'OPPONENT_MATCHING' || state?.phase === 'MAIN_BET_PLACED';
}

export function isUserActiveInMatch(state: DiceGameState, userId: string): boolean {
  if (!state.activeMatch) return false;
  const seats = [state.activeMatch.holderSeatIndex, state.activeMatch.opponentSeatIndex];
  return seats.some((idx) => {
    const seat = state.seats.find((s) => s.seatIndex === idx);
    if (!seat?.occupant) return false;
    if (seat.occupant.type === 'USER') return seat.occupant.userId === userId;
    return false;
  });
}

export function isUserSpectator(state: DiceGameState, userId: string | undefined): boolean {
  if (!userId || !state.activeMatch) return false;
  if (isUserActiveInMatch(state, userId)) return false;
  const seated = state.seats.some(
    (s) => s.occupant?.type === 'USER' && s.occupant.userId === userId,
  );
  if (state.gameMode === 'FRIENDS') {
    return seated && state.acceptedParticipantIds.includes(userId);
  }
  return seated;
}

/** Haar/Zeet peer betting — any seated non-active player during the 30s BETTING window. */
export function canRequestSideBet(state: DiceGameState, userId: string | undefined): boolean {
  if (!userId || !state.activeMatch) return false;
  if (state.phase !== 'BETTING') return false;
  if (isUserActiveInMatch(state, userId)) return false;
  const seated = state.seats.some(
    (s) => s.occupant?.type === 'USER' && s.occupant.userId === userId,
  );
  if (!seated) return false;
  if (state.gameMode === 'FRIENDS' && !state.acceptedParticipantIds.includes(userId)) return false;
  return true;
}

export function canAcceptPeerBet(state: DiceGameState, userId: string | undefined): boolean {
  if (!userId || state.phase !== 'BETTING') return false;
  return state.sideBets.some(
    (sb) => sb.status === 'PENDING'
      && (sb.counterpartyUserId === userId || sb.targetUserId === userId),
  );
}

/** True for TIGER / house bot whether or not public state sanitized BOT → USER. */
export function isTigerOccupant(
  occupant: NonNullable<DiceGameState['seats'][number]['occupant']>,
): boolean {
  if (occupant.type === 'BOT' && occupant.botId === 'tiger') return true;
  if (occupant.userId === 'player_tiger') return true;
  if (occupant.name === 'TIGER' || occupant.name === 'Shoot') return true;
  return false;
}

export function resolveOccupantKey(
  occupant: DiceGameState['seats'][number]['occupant'],
): string | null {
  if (!occupant) return null;
  if (occupant.type === 'USER') return occupant.userId ?? null;
  if (occupant.type === 'BOT') return occupant.botId ? `player_${occupant.botId}` : null;
  return null;
}
