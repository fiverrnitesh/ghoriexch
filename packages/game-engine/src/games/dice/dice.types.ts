export type DieFace = 1 | 3 | 4 | 6 | 'BLANK';
export type PlayerChoice = 'ODD' | 'EVEN';
export type SideBetPrediction = 'WIN' | 'LOSS';

export type DiceGameMode = 'ONLINE' | 'FRIENDS';

export type DicePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'BETTING'
  | 'MAIN_BET_PLACED'
  | 'OPPONENT_MATCHING'
  | 'MAIN_MATCH_CONFIRMED'
  | 'SIDE_BETTING'
  | 'FINAL_LOCK'
  /** @deprecated Use FINAL_LOCK — kept for backward-compatible reads */
  | 'BETTING_LOCKED'
  | 'PLAYER_TURN'
  | 'DICE_ROLLING'
  | 'RESULT'
  | 'SETTLEMENT'
  | 'ROTATION'
  | 'NEXT_MATCH'
  | 'GAME_PAUSED'
  | 'GAME_FINISHED';

export type SideBetLifecycle =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WON'
  | 'LOST'
  | 'CANCELLED'
  | 'REFUNDED';

export interface DiceConfig {
  minPlayers: number;
  maxPlayers: number;
  minEffectivePopulation: number;
  /** Opponent must match holder stake within this window */
  opponentMatchWindowSeconds: number;
  sideBetWindowSeconds: number;
  /** Countdown after side bets close, before auto-roll */
  finalLockSeconds: number;
  /** Platform fee on matched main-bet pool (e.g. 0.10 = 10%) */
  platformFeeRate: number;
  /** Side-bet total return multiplier on win (e.g. 1.9 = stake 100 returns 190) */
  payoutMultiplier: number;
  minBet: number;
  maxBet: number;
  botName: string;
  /** Seconds allowed for the active player to place a main bet (betting window) */
  turnTimeoutSeconds: number;
}

export interface DiceOccupant {
  type: 'USER' | 'BOT';
  userId?: string;
  botId?: string;
  name: string;
  avatarUrl?: string | null;
}

export interface DiceSeat {
  seatIndex: number;
  occupant: DiceOccupant | null;
}

export interface ActiveMatch {
  holderSeatIndex: number;
  opponentSeatIndex: number;
}

export type MainBetStatus = 'PENDING' | 'MATCHED' | 'SETTLED' | 'FORFEITED';

export interface MainBetState {
  userId: string;
  /** Active dice player this bet is on */
  activePlayerUserId?: string;
  amount: number;
  choice: PlayerChoice;
  betId?: string;
  roundId?: string;
  status?: MainBetStatus;
  placedAt?: string;
  settledAt?: string;
  /** Holder stake locked after PLACE_MAIN_BET */
  holderLocked?: boolean;
  opponentUserId?: string;
  opponentBotId?: string;
  opponentStake?: number;
  opponentBetId?: string;
  matchedPool?: number;
  /** Both stakes locked after opponent accepts / TIGER auto-match */
  locked: boolean;
}

export interface SideBetState {
  id: string;
  backerUserId: string;
  targetUserId: string;
  prediction: SideBetPrediction;
  amount: number;
  status: SideBetLifecycle;
  expiresAt: string;
  /** Real-player accepted liability (wallet-locked). */
  playerAcceptedAmount?: number;
  playerLiabilityUserId?: string;
  /** Unmatched remainder assigned to TIGER. */
  tigerLiability?: number;
}

export interface DiceGameState {
  phase: DicePhase;
  seats: DiceSeat[];
  maxSeats: number;
  activeMatch: ActiveMatch | null;
  /** Room creator — always initial dice holder for round 1 */
  roomHostUserId: string | null;
  gameMode: DiceGameMode | null;
  /** Friends mode: host-approved participants (includes host) */
  acceptedParticipantIds: string[];
  opponentMatchWindowEndsAt: string | null;
  sideBetWindowEndsAt: string | null;
  finalLockEndsAt: string | null;
  /** Idempotency for active phase window timeout (30s/20s/10s) */
  phaseTimerId: string | null;
  mainBet: MainBetState | null;
  dice: [DieFace, DieFace] | null;
  roundNumber: number;
  roundId: string;
  config: DiceConfig;
  sideBets: SideBetState[];
  lastWinnerSeatIndex: number | null;
  /** Seat currently holding the dice for this roll (may differ from holder on no-result pass). */
  rollerSeatIndex?: number | null;
  /** Test mode only — forced dice outcome */
  forcedDice?: [DieFace, DieFace] | null;
  /** Server-authoritative holder turn timer (ISO timestamps) */
  turnStartedAt: string | null;
  turnDeadlineAt: string | null;
  /** Idempotency key for the active turn timeout worker */
  turnTimerId: string | null;
}

export interface DiceRoundResult {
  die1: DieFace;
  die2: DieFace;
  hasBlank: boolean;
  matchingNumber: DieFace | null;
  parity: PlayerChoice | null;
  playerChoice: PlayerChoice;
  outcome: 'WIN' | 'LOSS' | 'NO_RESULT';
  /** Winner total return (90% of matched pool) */
  payout: number;
  /** Winner net profit */
  profit: number;
  holderStake: number;
  opponentStake: number;
  matchedPool: number;
  adminFee: number;
  winnerPayout: number;
  holderNet: number;
  opponentNet: number;
  loserLoss: number;
}
