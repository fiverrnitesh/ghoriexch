import type { DieFace, DiceConfig } from './dice.types.js';

/** Custom physical die faces — NOT standard 1-6 dice */
export const DIE_FACES: DieFace[] = [1, 3, 4, 6, 'BLANK', 'BLANK'];

/** Standing die (blank end face) interval in minutes — average once per hour (50–80 mins) */
export const STANDING_DIE_MIN_INTERVAL_MINUTES = 50;
export const STANDING_DIE_MAX_INTERVAL_MINUTES = 80;

/** Physical opposite-face relationships on custom dice (not standard 1–6 cube) */
export const OPPOSITE_FACES: Record<Exclude<DieFace, 'BLANK'>, Exclude<DieFace, 'BLANK'>> = {
  1: 6,
  6: 1,
  3: 4,
  4: 3,
};

export const NUMBERED_FACES: Exclude<DieFace, 'BLANK'>[] = [1, 3, 4, 6];

/** Physical oval: Shoot + 7 chairs. Real-player cap is 7; 8th real gets a new table. */
export const DICE_MAX_REAL_PLAYERS = 7;
export const DICE_TABLE_SEAT_COUNT = 8;
export const DICE_TABLE_OCCUPANT_TARGET = DICE_TABLE_SEAT_COUNT;

/**
 * Absolute seatIndex (increasing = clockwise from B).
 * Anti-clockwise walk (decreasing index): B → C → F → H → Shoot → D → E → G → B.
 */
export const DICE_SEAT = {
  B: 0,
  G: 1,
  E: 2,
  D: 3,
  SHOOT: 4,
  H: 5,
  F: 6,
  C: 7,
} as const;

export type DiceSeatId = (typeof DICE_SEAT)[keyof typeof DICE_SEAT];

/** Real users replace filler bots in this order. Shoot is never replaced. */
export const DICE_JOIN_ORDER: readonly DiceSeatId[] = [
  DICE_SEAT.B,
  DICE_SEAT.C,
  DICE_SEAT.D,
  DICE_SEAT.F,
  DICE_SEAT.E,
  DICE_SEAT.G,
  DICE_SEAT.H,
];

export const DICE_FILLER_BOTS: Record<number, { botId: string; name: string }> = {
  [DICE_SEAT.B]: { botId: 'filler_b', name: 'B' },
  [DICE_SEAT.C]: { botId: 'filler_c', name: 'C' },
  [DICE_SEAT.D]: { botId: 'filler_d', name: 'D' },
  [DICE_SEAT.E]: { botId: 'filler_e', name: 'E' },
  [DICE_SEAT.F]: { botId: 'filler_f', name: 'F' },
  [DICE_SEAT.G]: { botId: 'filler_g', name: 'G' },
  [DICE_SEAT.H]: { botId: 'filler_h', name: 'H' },
};

/** Diagram labels for absolute seatIndex (QA / nameplates). */
export const DICE_SEAT_LABEL: Record<number, string> = {
  [DICE_SEAT.B]: 'B',
  [DICE_SEAT.G]: 'G',
  [DICE_SEAT.E]: 'E',
  [DICE_SEAT.D]: 'D',
  [DICE_SEAT.SHOOT]: 'Shoot',
  [DICE_SEAT.H]: 'H',
  [DICE_SEAT.F]: 'F',
  [DICE_SEAT.C]: 'C',
};

export const DEFAULT_DICE_CONFIG: DiceConfig = {
  minPlayers: 2,
  maxPlayers: DICE_MAX_REAL_PLAYERS,
  minEffectivePopulation: 2,
  opponentMatchWindowSeconds: 30,
  /** Unified 30s window for main bet + Haar/Zeet peer bets */
  sideBetWindowSeconds: 30,
  /** Pause between rounds after settlement */
  interRoundPauseSeconds: 5,
  /** Short lock before NO_RESULT re-roll */
  finalLockSeconds: 5,
  /** Dice travel to roller before the 5s roll window */
  diceHandoffSeconds: 2,
  platformFeeRate: 0.1,
  payoutMultiplier: 1.9,
  minBet: 10,
  maxBet: 10000,
  botName: 'Shoot',
  /** Same as sideBetWindowSeconds — one visible betting timer for all */
  turnTimeoutSeconds: 30,
};

export const DICE_ACTIONS = {
  JOIN: 'JOIN',
  LEAVE: 'LEAVE',
  PLACE_MAIN_BET: 'PLACE_MAIN_BET',
  ACCEPT_OPPONENT_MATCH: 'ACCEPT_OPPONENT_MATCH',
  LOCK_BETTING: 'LOCK_BETTING',
  ROLL_DICE: 'ROLL_DICE',
  REQUEST_SIDE_BET: 'REQUEST_SIDE_BET',
  ACCEPT_SIDE_BET: 'ACCEPT_SIDE_BET',
  REJECT_SIDE_BET: 'REJECT_SIDE_BET',
  ADVANCE_PHASE: 'ADVANCE_PHASE',
  PHASE_TIMEOUT: 'PHASE_TIMEOUT',
  FORCE_DICE: 'FORCE_DICE',
  TURN_TIMEOUT: 'TURN_TIMEOUT',
} as const;

export const DICE_EVENTS = {
  PLAYER_JOINED: 'dice:player_joined',
  PLAYER_LEFT: 'dice:player_left',
  MATCHUP_SET: 'dice:matchup_set',
  BETTING_OPEN: 'dice:betting_open',
  PASS_TO_ROLLER: 'dice:pass_to_roller',
  MAIN_BET_PLACED: 'dice:main_bet_placed',
  MAIN_MATCH_CONFIRMED: 'dice:main_match_confirmed',
  OPPONENT_MATCH_EXPIRED: 'dice:opponent_match_expired',
  BETTING_LOCKED: 'dice:betting_locked',
  SIDE_BET_REQUEST: 'dice:side_bet_request',
  SIDE_BET_ACCEPTED: 'dice:side_bet_accepted',
  SIDE_BET_REJECTED: 'dice:side_bet_rejected',
  DICE_ROLLING: 'dice:rolling',
  DICE_RESULT: 'dice:result',
  WINNER: 'dice:winner',
  ROTATION: 'dice:rotation',
  SETTLEMENT: 'dice:settlement',
  TIMER: 'dice:timer',
  TURN_TIMEOUT: 'dice:turn_timeout',
} as const;
