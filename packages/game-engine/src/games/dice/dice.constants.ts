import type { DieFace, DiceConfig } from './dice.types.js';

/** Custom physical die faces — NOT standard 1-6 dice */
export const DIE_FACES: DieFace[] = [1, 3, 4, 6, 'BLANK', 'BLANK'];

/** Physical opposite-face relationships on custom dice (not standard 1–6 cube) */
export const OPPOSITE_FACES: Record<Exclude<DieFace, 'BLANK'>, Exclude<DieFace, 'BLANK'>> = {
  1: 6,
  6: 1,
  3: 4,
  4: 3,
};

export const NUMBERED_FACES: Exclude<DieFace, 'BLANK'>[] = [1, 3, 4, 6];

export const DEFAULT_DICE_CONFIG: DiceConfig = {
  minPlayers: 2,
  maxPlayers: 6,
  minEffectivePopulation: 2,
  opponentMatchWindowSeconds: 30,
  /** 10-second accept/reject window after betting closes */
  sideBetWindowSeconds: 10,
  /** 5-second manual roll window (server auto-rolls on expiry) */
  finalLockSeconds: 5,
  platformFeeRate: 0.1,
  payoutMultiplier: 1.9,
  minBet: 10,
  maxBet: 10000,
  botName: 'Shoot',
  /** 15-second server-authoritative betting window */
  turnTimeoutSeconds: 15,
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
