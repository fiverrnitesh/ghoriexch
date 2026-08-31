import type { DiceGameState } from '@games/game-engine/browser';

/** Map backend phases to player-facing labels (no hardcoded fake phases). */
export function getDisplayPhase(state: DiceGameState, phaseTimerSeconds?: number): string {
  const { phase, mainBet, activeMatch } = state;

  if (!activeMatch) return 'WAITING';

  switch (phase) {
    case 'WAITING_FOR_PLAYERS':
      return 'WAITING';
    case 'BETTING':
      return 'BETTING';
    case 'MAIN_BET_PLACED':
    case 'OPPONENT_MATCHING':
      return 'BETTING';
    case 'FINAL_LOCK':
      return 'ROLL_READY';
    case 'BETTING_LOCKED':
      return mainBet ? 'ROLL_READY' : 'BETTING';
    case 'PLAYER_TURN':
      return 'BETTING';
    case 'DICE_ROLLING':
      return 'ROLLING';
    case 'RESULT':
      return 'RESULT';
    case 'SETTLEMENT':
      return 'SETTLEMENT';
    case 'ROTATION':
    case 'NEXT_MATCH':
      return 'ROTATING';
    case 'GAME_PAUSED':
      return 'PAUSED';
    case 'GAME_FINISHED':
      return 'FINISHED';
    default:
      return String(phase).replace(/_/g, ' ');
  }
}

/** Human-readable badge for sidebar / header. */
export function getPhaseBadgeLabel(displayPhase: string): string {
  const labels: Record<string, string> = {
    WAITING: 'Waiting for Players',
    BETTING: 'Betting',
    BACKING_BETTING: 'Backing Betting',
    ACCEPT_BETS: 'Accept Bets',
    ROLL_READY: 'Roll Ready',
    OPPONENT_MATCHING: 'Betting',
    SIDE_BETTING: 'Accept Bets',
    FINAL_LOCK: 'Roll Ready',
    DICE_HOLDER_TURN: 'Betting',
    CHOOSING: 'Betting',
    READY_TO_ROLL: 'Roll Ready',
    ROLLING: 'Rolling Dice',
    RESULT: 'Dice Result',
    SETTLEMENT: 'Settlement',
    ROTATING: 'Next Match',
    PAUSED: 'Paused',
    FINISHED: 'Finished',
  };
  return labels[displayPhase] ?? displayPhase.replace(/_/g, ' ');
}

export function getOccupantDisplayName(
  seat: DiceGameState['seats'][number] | null | undefined,
  playerMeta: Record<string, { displayName: string }>,
): string {
  if (!seat?.occupant) return '—';
  const occ = seat.occupant;
  if (occ.type === 'BOT' && occ.botId === 'tiger') return 'Shoot';
  if (occ.userId === 'player_tiger' || occ.name === 'TIGER' || occ.name === 'Shoot') return 'Shoot';
  if (occ.type === 'BOT' || (typeof occ.userId === 'string' && occ.userId.startsWith('player_filler_'))) {
    const labels = ['B', 'G', 'E', 'D', 'Shoot', 'H', 'F', 'C'] as const;
    return labels[seat.seatIndex] ?? occ.name;
  }
  const key = occ.type === 'USER' ? occ.userId : occ.botId;
  if (key && playerMeta[key]) return playerMeta[key].displayName;
  return occ.name;
}
