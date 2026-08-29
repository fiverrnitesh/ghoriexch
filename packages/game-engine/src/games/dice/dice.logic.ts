import { randomInt } from 'node:crypto';
import { DIE_FACES } from './dice.constants.js';
import type {
  ActiveMatch,
  DieFace,
  DiceGameState,
  DiceRoundResult,
  DiceSeat,
  PlayerChoice,
  SideBetLifecycle,
  SideBetState,
} from './dice.types.js';

/** Secure default RNG — not Math.random, not bet/wallet/identity dependent. */
function secureUnit(): number {
  return randomInt(1_000_000_000) / 1_000_000_000;
}

export function rollDie(rng: () => number = secureUnit): DieFace {
  const idx = Math.floor(rng() * DIE_FACES.length);
  return DIE_FACES[idx]!;
}

/** Two independent dice. BLANK+BLANK is rejected and rerolled. */
export function rollDicePair(rng: () => number = secureUnit): [DieFace, DieFace] {
  let a = rollDie(rng);
  let b = rollDie(rng);
  let guard = 0;
  while (a === 'BLANK' && b === 'BLANK' && guard < 64) {
    b = rollDie(rng);
    guard += 1;
  }
  if (a === 'BLANK' && b === 'BLANK') {
    b = 1;
  }
  return [a, b];
}

export type DiceFaceResolution =
  | { kind: 'RESULT'; parity: PlayerChoice; matchingNumber: DieFace; hasBlank: boolean }
  | { kind: 'NO_RESULT'; matchingNumber: null; parity: null; hasBlank: boolean };

/**
 * FINAL dice result rule:
 * - same numbered faces → that number's parity
 * - exactly one BLANK → the numbered die's parity (immediate result)
 * - two different non-blank numbers → NO RESULT
 * - BLANK+BLANK must not occur (treated as NO RESULT if it does)
 */
export function resolveDiceFaces(die1: DieFace, die2: DieFace): DiceFaceResolution {
  const b1 = isBlank(die1);
  const b2 = isBlank(die2);
  if (b1 && b2) {
    return { kind: 'NO_RESULT', matchingNumber: null, parity: null, hasBlank: true };
  }
  if (b1 && !b2) {
    const n = die2 as Exclude<DieFace, 'BLANK'>;
    return { kind: 'RESULT', parity: numberToParity(n), matchingNumber: n, hasBlank: true };
  }
  if (b2 && !b1) {
    const n = die1 as Exclude<DieFace, 'BLANK'>;
    return { kind: 'RESULT', parity: numberToParity(n), matchingNumber: n, hasBlank: true };
  }
  if (die1 === die2) {
    const n = die1 as Exclude<DieFace, 'BLANK'>;
    return { kind: 'RESULT', parity: numberToParity(n), matchingNumber: n, hasBlank: false };
  }
  return { kind: 'NO_RESULT', matchingNumber: null, parity: null, hasBlank: false };
}

/** PAO selected → ODD; otherwise EVEN. */
export function resolveMainBetChoice(payload: { choice?: unknown; pao?: unknown }): PlayerChoice {
  if (payload.pao === true || payload.choice === 'ODD') return 'ODD';
  return 'EVEN';
}

export function isBlank(face: DieFace): boolean {
  return face === 'BLANK';
}

export function getMatchingNumber(die1: DieFace, die2: DieFace): DieFace | null {
  if (isBlank(die1) || isBlank(die2)) return null;
  if (die1 === die2) return die1;
  return null;
}

export function numberToParity(n: Exclude<DieFace, 'BLANK'>): PlayerChoice {
  return n === 1 || n === 3 ? 'ODD' : 'EVEN';
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Matched-pool settlement: 10% platform fee, 90% winner payout. payout + fee = pool. */
export function computeMatchedPoolSettlement(
  holderStake: number,
  opponentStake: number,
  platformFeeRate = 0.1,
): { matchedPool: number; adminFee: number; winnerPayout: number } {
  const matchedPool = roundMoney(holderStake + opponentStake);
  const adminFee = roundMoney(matchedPool * platformFeeRate);
  const winnerPayout = roundMoney(matchedPool - adminFee);
  return { matchedPool, adminFee, winnerPayout };
}

/** Authoritative outcome evaluation — server-side only */
export function evaluateMainBet(
  die1: DieFace,
  die2: DieFace,
  choice: PlayerChoice,
  holderStake: number,
  opponentStake: number,
  platformFeeRate = 0.1,
): DiceRoundResult {
  const resolved = resolveDiceFaces(die1, die2);

  if (resolved.kind === 'NO_RESULT') {
    return {
      die1,
      die2,
      hasBlank: resolved.hasBlank,
      matchingNumber: null,
      parity: null,
      playerChoice: choice,
      outcome: 'NO_RESULT',
      payout: 0,
      profit: 0,
      holderStake,
      opponentStake,
      matchedPool: 0,
      adminFee: 0,
      winnerPayout: 0,
      holderNet: 0,
      opponentNet: 0,
      loserLoss: 0,
    };
  }

  const outcome: 'WIN' | 'LOSS' = resolved.parity === choice ? 'WIN' : 'LOSS';

  const { matchedPool, adminFee, winnerPayout } = computeMatchedPoolSettlement(
    holderStake,
    opponentStake,
    platformFeeRate,
  );

  const holderWins = outcome === 'WIN';
  const holderNet = holderWins
    ? roundMoney(winnerPayout - holderStake)
    : roundMoney(-holderStake);
  const opponentNet = holderWins
    ? roundMoney(-opponentStake)
    : roundMoney(winnerPayout - opponentStake);
  const loserLoss = holderWins ? opponentStake : holderStake;

  return {
    die1,
    die2,
    hasBlank: resolved.hasBlank,
    matchingNumber: resolved.matchingNumber,
    parity: resolved.parity,
    playerChoice: choice,
    outcome,
    payout: winnerPayout,
    profit: holderWins ? roundMoney(winnerPayout - holderStake) : roundMoney(winnerPayout - opponentStake),
    holderStake,
    opponentStake,
    matchedPool,
    adminFee,
    winnerPayout,
    holderNet,
    opponentNet,
    loserLoss,
  };
}

export function evaluateSideBet(
  sideBet: SideBetState,
  mainOutcome: 'WIN' | 'LOSS',
  _stake: number,
  _payoutMultiplier: number,
): SideBetLifecycle {
  if (sideBet.status !== 'ACCEPTED') return sideBet.status;
  const targetWins = mainOutcome === 'WIN';
  const predictedWin = sideBet.prediction === 'WIN';
  if (targetWins === predictedWin) return 'WON';
  return 'LOST';
}

export function sideBetPayout(stake: number, payoutMultiplier: number): number {
  return roundMoney(stake * payoutMultiplier);
}

/** Anti-clockwise among occupied seats only */
export function findNextSeatAntiClockwise(
  seats: DiceSeat[],
  fromSeatIndex: number,
  exclude: number[] = [],
): number | null {
  const occupied = seats
    .filter((s) => s.occupant)
    .map((s) => s.seatIndex)
    .sort((a, b) => a - b);

  if (occupied.length === 0) return null;

  const fromIdx = occupied.indexOf(fromSeatIndex);
  const start = fromIdx >= 0 ? fromIdx : 0;

  for (let step = 1; step <= occupied.length; step++) {
    const nextIdx = (start - step + occupied.length) % occupied.length;
    const candidate = occupied[nextIdx]!;
    if (!exclude.includes(candidate)) return candidate;
  }
  return null;
}

export function buildInitialMatch(seats: DiceSeat[], hostUserId?: string | null): ActiveMatch | null {
  const occupied = seats.filter((s) => s.occupant).sort((a, b) => a.seatIndex - b.seatIndex);
  if (occupied.length < 2) return null;

  let holderSeatIndex = occupied[0]!.seatIndex;
  if (hostUserId) {
    const hostSeat = seats.find((s) => s.occupant?.type === 'USER' && s.occupant.userId === hostUserId);
    if (hostSeat) holderSeatIndex = hostSeat.seatIndex;
  }

  const opponent = findNextSeatAntiClockwise(seats, holderSeatIndex, [holderSeatIndex]);
  if (opponent === null) return null;
  return { holderSeatIndex, opponentSeatIndex: opponent };
}

export function getActiveOpponentActorId(state: DiceGameState): string | null {
  const seat = state.seats.find((s) => s.seatIndex === state.activeMatch?.opponentSeatIndex);
  if (!seat?.occupant) return null;
  return seat.occupant.type === 'USER' ? seat.occupant.userId ?? null : seat.occupant.botId ?? null;
}

export function isAcceptedParticipant(state: DiceGameState, userId: string): boolean {
  if (state.gameMode === 'FRIENDS') {
    return state.acceptedParticipantIds.includes(userId);
  }
  return state.seats.some((s) => s.occupant?.type === 'USER' && s.occupant.userId === userId);
}

export function isEligibleSideBettor(state: DiceGameState, userId: string): boolean {
  if (!isAcceptedParticipant(state, userId)) return false;
  return isSpectator(state, userId);
}

export function hasTigerBot(seats: DiceSeat[]): boolean {
  return seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger');
}

/** Every room always has TIGER, including FRIENDS mode. TIGER uses a reserved seat. */
export function shouldAddTigerBot(
  seats: DiceSeat[],
  maxSeats: number,
  _gameMode: DiceGameState['gameMode'] = 'ONLINE',
): boolean {
  if (hasTigerBot(seats)) return false;
  return countOccupants(seats) < maxSeats;
}

/** Names and seeds for dynamic filler bot players so table always has 8 active seats */
export const FILLER_BOT_POOL = [
  { botId: 'bot_majid', name: 'majid', avatarSeed: 'majid' },
  { botId: 'bot_sikander', name: 'sikander1', avatarSeed: 'sikander1' },
  { botId: 'bot_rahul', name: 'Rahul', avatarSeed: 'rahul' },
  { botId: 'bot_tanya', name: 'Tanya', avatarSeed: 'tanya' },
  { botId: 'bot_rohit', name: 'Rohit', avatarSeed: 'rohit' },
  { botId: 'bot_sneha', name: 'Sneha', avatarSeed: 'sneha' },
  { botId: 'bot_arjun', name: 'Arjun', avatarSeed: 'arjun' },
  { botId: 'bot_vikram', name: 'Vikram', avatarSeed: 'vikram' },
] as const;

/**
 * Ensures table always has exactly 8 players:
 * - 1 Shoot bot (always present)
 * - Real users (up to 7)
 * - Filler bots fill all remaining empty seats so total seated is always 8.
 * When real players join, filler bots automatically vacate.
 */
export function syncTableSeats(state: DiceGameState, targetTotal = 8): DiceGameState {
  // Ensure seats array has at least targetTotal slots
  if (state.seats.length < targetTotal) {
    const missing = targetTotal - state.seats.length;
    for (let i = 0; i < missing; i++) {
      state.seats.push({ seatIndex: state.seats.length, occupant: null });
    }
    state.maxSeats = Math.max(state.maxSeats, targetTotal);
  }

  // 1. Ensure Shoot (tiger) is seated
  if (!hasTigerBot(state.seats)) {
    state.seats = assignSeat(state.seats, {
      type: 'BOT',
      botId: 'tiger',
      name: state.config.botName,
      avatarUrl: null,
    });
  }

  // 2. Count real users and determine needed filler bots
  const realUserCount = countRealUsers(state.seats);
  // Shoot takes 1 seat, real users take realUserCount seats
  const neededFillerBots = Math.max(0, targetTotal - 1 - realUserCount);

  // Current filler bots seated (excluding tiger)
  const currentFillerSeats = state.seats.filter(
    (s) => s.occupant?.type === 'BOT' && s.occupant.botId !== 'tiger',
  );

  // If we have too many filler bots (a real user joined), remove excess
  if (currentFillerSeats.length > neededFillerBots) {
    const excess = currentFillerSeats.length - neededFillerBots;
    const toRemove = currentFillerSeats.slice(currentFillerSeats.length - excess);
    for (const seat of toRemove) {
      seat.occupant = null;
    }
  }

  // If we need more filler bots (a real user left or on initial start), fill empty seats
  const currentTotalOccupants = countOccupants(state.seats);
  if (currentTotalOccupants < targetTotal) {
    const existingBotIds = new Set(
      state.seats
        .filter((s) => s.occupant?.type === 'BOT')
        .map((s) => s.occupant!.botId),
    );

    for (const botDef of FILLER_BOT_POOL) {
      if (countOccupants(state.seats) >= targetTotal) break;
      if (existingBotIds.has(botDef.botId)) continue;

      state.seats = assignSeat(state.seats, {
        type: 'BOT',
        botId: botDef.botId,
        name: botDef.name,
        avatarUrl: `https://api.dicebear.com/7.x/personas/svg?seed=${botDef.avatarSeed}`,
      });
      existingBotIds.add(botDef.botId);
    }
  }

  return state;
}

export function seatTigerBot(state: DiceGameState): DiceGameState {
  return syncTableSeats(state, 8);
}

/** Strip internal bot metadata from player-facing state. */
export function sanitizePublicDiceState(state: DiceGameState): DiceGameState {
  const next = structuredClone(state) as DiceGameState;
  next.seats = next.seats.map((seat) => {
    if (seat.occupant?.type !== 'BOT') return seat;
    return {
      ...seat,
      occupant: {
        ...seat.occupant,
        type: 'USER' as const,
        botId: undefined,
        name: seat.occupant.name,
        userId: `player_${seat.occupant.botId ?? seat.seatIndex}`,
      },
    };
  });
  if (next.mainBet?.opponentBotId) {
    next.mainBet = { ...next.mainBet, opponentBotId: undefined };
  }
  next.sideBets = next.sideBets.map((sb) => ({
    ...sb,
    playerAcceptedAmount: undefined,
    playerLiabilityUserId: undefined,
    tigerLiability: undefined,
  }));
  return next;
}

export function rotateAfterWin(state: DiceGameState): ActiveMatch | null {
  const { holderSeatIndex, opponentSeatIndex } = state.activeMatch!;

  if (countOccupants(state.seats) <= 2) {
    return { holderSeatIndex, opponentSeatIndex };
  }

  const nextOpponent = findNextSeatAntiClockwise(state.seats, opponentSeatIndex, [
    holderSeatIndex,
  ]);
  if (nextOpponent === null) return null;
  return { holderSeatIndex, opponentSeatIndex: nextOpponent };
}

export function rotateAfterLoss(state: DiceGameState): ActiveMatch | null {
  const { opponentSeatIndex } = state.activeMatch!;
  const nextOpponent = findNextSeatAntiClockwise(state.seats, opponentSeatIndex, [opponentSeatIndex]);
  if (nextOpponent === null) return null;
  return { holderSeatIndex: opponentSeatIndex, opponentSeatIndex: nextOpponent };
}

export function countRealUsers(seats: DiceSeat[]): number {
  return seats.filter((s) => s.occupant?.type === 'USER').length;
}

/** TIGER always occupies a seat and does not count toward max real players. Table has at least 8 seats. */
export function diceTableSeatCount(maxRealPlayers: number): number {
  return Math.max(8, maxRealPlayers + 1);
}

export function countOccupants(seats: DiceSeat[]): number {
  return seats.filter((s) => s.occupant).length;
}

export function getHolderUserId(state: DiceGameState): string | null {
  const seat = state.seats.find((s) => s.seatIndex === state.activeMatch?.holderSeatIndex);
  if (!seat?.occupant || seat.occupant.type !== 'USER') return null;
  return seat.occupant.userId ?? null;
}

/** Active dice holder actor id — userId or botId for authorization */
export function getActiveHolderActorId(state: DiceGameState): string | null {
  const seat = state.seats.find((s) => s.seatIndex === state.activeMatch?.holderSeatIndex);
  if (!seat?.occupant) return null;
  return seat.occupant.type === 'USER' ? seat.occupant.userId ?? null : seat.occupant.botId ?? null;
}

/** User ids of the two active head-to-head players (excludes bots). */
export function getActiveMatchUserIds(state: DiceGameState): string[] {
  if (!state.activeMatch) return [];
  const holder = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
  const opponent = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
  return [holder, opponent]
    .map((s) => (s?.occupant?.type === 'USER' ? s.occupant.userId : null))
    .filter((id): id is string => !!id);
}

export function getSeatActorId(seat: DiceSeat | undefined): string | null {
  if (!seat?.occupant) return null;
  return seat.occupant.type === 'USER' ? seat.occupant.userId ?? null : seat.occupant.botId ?? null;
}

/** Actor currently allowed to roll (holder, or opponent after a no-result pass). */
export function getActiveRollerActorId(state: DiceGameState): string | null {
  const idx = state.rollerSeatIndex ?? state.activeMatch?.holderSeatIndex;
  if (idx === undefined || idx === null) return null;
  return getSeatActorId(state.seats.find((s) => s.seatIndex === idx));
}

export function getMatchOpponentSeatIndex(state: DiceGameState, fromSeatIndex: number): number | null {
  if (!state.activeMatch) return null;
  const { holderSeatIndex, opponentSeatIndex } = state.activeMatch;
  if (fromSeatIndex === holderSeatIndex) return opponentSeatIndex;
  if (fromSeatIndex === opponentSeatIndex) return holderSeatIndex;
  return null;
}

export function isActiveMatchTarget(state: DiceGameState, targetId: string): boolean {
  if (!state.activeMatch) return false;
  for (const idx of [state.activeMatch.holderSeatIndex, state.activeMatch.opponentSeatIndex]) {
    const occ = state.seats.find((s) => s.seatIndex === idx)?.occupant;
    if (!occ) continue;
    if (occ.type === 'USER' && occ.userId === targetId) return true;
    if (occ.type === 'BOT' && (occ.botId === targetId || `player_${occ.botId}` === targetId)) return true;
  }
  return false;
}

export function isTigerTargetId(state: DiceGameState, targetId: string): boolean {
  return state.seats.some((s) => {
    const occ = s.occupant;
    if (occ?.type !== 'BOT') return false;
    return occ.botId === targetId || `player_${occ.botId}` === targetId;
  });
}

export function assignPendingSideBetsToTiger(state: DiceGameState): string[] {
  const assigned: string[] = [];
  for (const sb of state.sideBets) {
    if (sb.status !== 'PENDING') continue;
    const playerPart = sb.playerAcceptedAmount ?? 0;
    sb.tigerLiability = roundMoney(sb.amount - playerPart);
    sb.status = 'ACCEPTED';
    assigned.push(sb.id);
  }
  return assigned;
}

export function isActiveMatchPlayer(state: DiceGameState, userId: string): boolean {
  return getActiveMatchUserIds(state).includes(userId);
}

export function getSeatOccupantId(seat: DiceSeat): string | null {
  if (!seat.occupant) return null;
  return seat.occupant.type === 'USER' ? seat.occupant.userId ?? null : seat.occupant.botId ?? null;
}

export function isSpectator(state: DiceGameState, userId: string): boolean {
  if (!state.activeMatch) return true;
  const holder = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
  const opponent = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
  const activeIds = [holder, opponent]
    .map((s) => (s?.occupant?.type === 'USER' ? s.occupant.userId : null))
    .filter(Boolean);
  return !activeIds.includes(userId);
}

export function createEmptySeats(maxSeats: number): DiceSeat[] {
  return Array.from({ length: maxSeats }, (_, i) => ({ seatIndex: i, occupant: null }));
}

export function assignSeat(seats: DiceSeat[], occupant: DiceSeat['occupant']): DiceSeat[] {
  const next = seats.map((s) => ({ ...s, occupant: s.occupant ? { ...s.occupant } : null }));
  const empty = next.find((s) => !s.occupant);
  if (!empty || !occupant) return next;
  empty.occupant = { ...occupant };
  return next;
}

export function removeUserFromSeats(seats: DiceSeat[], userId: string): DiceSeat[] {
  return seats.map((s) =>
    s.occupant?.type === 'USER' && s.occupant.userId === userId
      ? { ...s, occupant: null }
      : { ...s, occupant: s.occupant ? { ...s.occupant } : null },
  );
}

export function createInitialState(
  config: DiceGameState['config'],
  maxSeats = diceTableSeatCount(config.maxPlayers),
): DiceGameState {
  return {
    phase: 'WAITING_FOR_PLAYERS',
    seats: createEmptySeats(maxSeats),
    maxSeats,
    activeMatch: null,
    roomHostUserId: null,
    gameMode: null,
    acceptedParticipantIds: [],
    opponentMatchWindowEndsAt: null,
    sideBetWindowEndsAt: null,
    finalLockEndsAt: null,
    phaseTimerId: null,
    mainBet: null,
    dice: null,
    roundNumber: 0,
    roundId: '',
    config,
    sideBets: [],
    lastWinnerSeatIndex: null,
    rollerSeatIndex: null,
    forcedDice: null,
    turnStartedAt: null,
    turnDeadlineAt: null,
    turnTimerId: null,
  };
}

export function generateRoundId(): string {
  return `dr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
