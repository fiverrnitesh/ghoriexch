import { randomInt } from 'node:crypto';
import {
  DIE_FACES,
  NUMBERED_FACES,
  STANDING_DIE_MIN_INTERVAL_MINUTES,
  STANDING_DIE_MAX_INTERVAL_MINUTES,
  DICE_FILLER_BOTS,
  DICE_JOIN_ORDER,
  DICE_MAX_REAL_PLAYERS,
  DICE_SEAT,
  DICE_SEAT_LABEL,
  DICE_TABLE_SEAT_COUNT,
  DEFAULT_DICE_CONFIG,
} from './dice.constants.js';
import type {
  ActiveMatch,
  DieFace,
  DiceGameState,
  DiceRoundResult,
  DiceOccupant,
  DiceSeat,
  PlayerChoice,
  SideBetLifecycle,
  SideBetState,
} from './dice.types.js';

/** Secure default RNG — not Math.random, not bet/wallet/identity dependent. */
function secureUnit(): number {
  return randomInt(1_000_000_000) / 1_000_000_000;
}

export function getRandomStandingIntervalMs(rng: () => number = secureUnit): number {
  const minMs = STANDING_DIE_MIN_INTERVAL_MINUTES * 60 * 1000;
  const maxMs = STANDING_DIE_MAX_INTERVAL_MINUTES * 60 * 1000;
  return minMs + Math.floor(rng() * (maxMs - minMs));
}

export function rollNumberedDie(rng: () => number = secureUnit): Exclude<DieFace, 'BLANK'> {
  const idx = Math.floor(rng() * NUMBERED_FACES.length);
  return NUMBERED_FACES[idx]!;
}

export function rollDie(rng: () => number = secureUnit): DieFace {
  const idx = Math.floor(rng() * DIE_FACES.length);
  return DIE_FACES[idx]!;
}

export function rollStandingDicePair(rng: () => number = secureUnit): [DieFace, DieFace] {
  const numbered = rollNumberedDie(rng);
  return rng() < 0.5 ? ['BLANK', numbered] : [numbered, 'BLANK'];
}

/**
 * Rolls a pair of dice:
 * - If allowStandingDie is false (normal rolls): both dice roll standard numbers (1, 3, 4, 6)
 * - If allowStandingDie is true (once every 50–80 mins): one die is standing (BLANK) and one is numbered
 * - BLANK+BLANK is never possible.
 */
export function rollDicePair(
  rng: () => number = secureUnit,
  allowStandingDie: boolean = false,
): [DieFace, DieFace] {
  if (allowStandingDie) {
    return rollStandingDicePair(rng);
  }
  return [rollNumberedDie(rng), rollNumberedDie(rng)];
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
  if (countRealUsers(seats) < 1) return null;

  const shootSeat = seats.find((s) => isTigerOccupant(s.occupant));
  const bSeat = seats.find((s) => s.seatIndex === DICE_SEAT.B && s.occupant);
  if (shootSeat && bSeat && shootSeat.seatIndex !== bSeat.seatIndex) {
    return { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: shootSeat.seatIndex };
  }

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

export function getPeerBetCounterpartyId(sb: SideBetState): string {
  return sb.counterpartyUserId ?? sb.targetUserId ?? '';
}

export function getPeerBetAcceptedAmount(sb: SideBetState): number {
  return sb.counterpartyAcceptedAmount ?? sb.playerAcceptedAmount ?? 0;
}

export function getPeerBetSystemLiability(sb: SideBetState): number {
  return sb.systemLiability ?? sb.tigerLiability ?? 0;
}

export function normalizePeerBet(sb: SideBetState): SideBetState {
  const counterpartyUserId = getPeerBetCounterpartyId(sb);
  const counterpartyAcceptedAmount = getPeerBetAcceptedAmount(sb);
  const systemLiability = getPeerBetSystemLiability(sb);
  return {
    ...sb,
    counterpartyUserId,
    targetUserId: counterpartyUserId,
    counterpartyAcceptedAmount,
    playerAcceptedAmount: counterpartyAcceptedAmount,
    systemLiability,
    tigerLiability: systemLiability,
    displayAcceptedByUserId: sb.displayAcceptedByUserId ?? counterpartyUserId,
  };
}

export function finalizePeerBetAcceptance(
  sb: SideBetState,
  counterpartyUserId: string,
  acceptedAmount: number,
): void {
  const playerPart = roundMoney(Math.min(acceptedAmount, sb.amount));
  const systemPart = roundMoney(sb.amount - playerPart);
  sb.counterpartyAcceptedAmount = playerPart;
  sb.playerAcceptedAmount = playerPart;
  sb.systemLiability = systemPart;
  sb.tigerLiability = systemPart;
  sb.counterpartyUserId = counterpartyUserId;
  sb.targetUserId = counterpartyUserId;
  sb.displayAcceptedByUserId = counterpartyUserId;
  sb.status = 'ACCEPTED';
}

export function isEligiblePeerBettor(state: DiceGameState, userId: string): boolean {
  if (!isAcceptedParticipant(state, userId)) return false;
  return !isActiveMatchPlayer(state, userId);
}

/** @deprecated Use isEligiblePeerBettor */
export function isEligibleSideBettor(state: DiceGameState, userId: string): boolean {
  return isEligiblePeerBettor(state, userId);
}

export function isSeatedCounterparty(state: DiceGameState, counterpartyId: string): boolean {
  if (!counterpartyId) return false;
  return state.seats.some((seat) => {
    const occ = seat.occupant;
    if (!occ) return false;
    if (occ.type === 'USER' && occ.userId === counterpartyId) return true;
    if (occ.type === 'BOT' && (occ.botId === counterpartyId || `player_${occ.botId}` === counterpartyId)) {
      return true;
    }
    return false;
  });
}

/** @deprecated Peer bets use any seated counterparty */
export function isActiveMatchTarget(state: DiceGameState, targetId: string): boolean {
  return isSeatedCounterparty(state, targetId);
}

export function hasTigerBot(seats: DiceSeat[]): boolean {
  return seats.some((s) => isTigerOccupant(s.occupant));
}

export function isTigerOccupant(occupant: DiceOccupant | null | undefined): boolean {
  return occupant?.type === 'BOT' && occupant.botId === 'tiger';
}

export function isFillerBot(occupant: DiceOccupant | null | undefined): boolean {
  return occupant?.type === 'BOT' && !!occupant.botId && occupant.botId !== 'tiger';
}

/** True when counterparty id refers to a seated filler bot (player_filler_* or filler_*). */
export function isFillerCounterpartyId(state: DiceGameState, counterpartyId: string): boolean {
  if (!counterpartyId) return false;
  if (counterpartyId.startsWith('player_filler_') || counterpartyId.startsWith('filler_')) {
    return state.seats.some((seat) => {
      const occ = seat.occupant;
      if (!occ || !isFillerBot(occ)) return false;
      return occ.botId === counterpartyId
        || `player_${occ.botId}` === counterpartyId;
    });
  }
  return state.seats.some((seat) => {
    const occ = seat.occupant;
    return isFillerBot(occ)
      && (occ!.botId === counterpartyId || `player_${occ!.botId}` === counterpartyId);
  });
}

export function realPlayerCap(maxPlayers: number): number {
  return Math.max(1, Math.min(maxPlayers, DICE_MAX_REAL_PLAYERS));
}

function shootOccupant(_botName?: string): DiceOccupant {
  return {
    type: 'BOT',
    botId: 'tiger',
    name: DICE_SEAT_LABEL[DICE_SEAT.SHOOT] ?? 'Shoot',
    avatarUrl: null,
  };
}

function fillerOccupant(seatIndex: number): DiceOccupant | null {
  const spec = DICE_FILLER_BOTS[seatIndex];
  if (!spec) return null;
  return { type: 'BOT', botId: spec.botId, name: spec.name, avatarUrl: null };
}

/** Every room always has TIGER, including FRIENDS mode. TIGER uses a reserved seat. */
export function shouldAddTigerBot(
  seats: DiceSeat[],
  maxSeats: number,
  _gameMode: DiceGameState['gameMode'] = 'ONLINE',
): boolean {
  if (hasTigerBot(seats)) return false;
  return countOccupants(seats) < maxSeats || seats.some((s) => !s.occupant || isFillerBot(s.occupant));
}

/**
 * Always 8 occupants: Shoot at seat 4, filler bots in every other empty chair.
 * Real users are never moved; fillers are only removed when a real player takes that chair.
 */
export function syncTableSeats(
  state: DiceGameState,
  _targetTotal = DICE_TABLE_SEAT_COUNT,
): DiceGameState {
  const seatCount = DICE_TABLE_SEAT_COUNT;
  if (state.seats.length < seatCount) {
    const missing = seatCount - state.seats.length;
    for (let i = 0; i < missing; i++) {
      state.seats.push({ seatIndex: state.seats.length, occupant: null });
    }
  }
  if (state.seats.length > seatCount) {
    const extras = state.seats.filter((s) => s.seatIndex >= seatCount);
    state.seats = state.seats.filter((s) => s.seatIndex < seatCount);
    for (const extra of extras) {
      if (extra.occupant?.type === 'USER') {
        state.seats = assignRealPlayerSeat(state.seats, extra.occupant);
      }
    }
  }
  state.maxSeats = seatCount;
  ensureShootSeated(state);
  for (const seat of state.seats) {
    if (seat.seatIndex === DICE_SEAT.SHOOT) continue;
    if (!seat.occupant) seat.occupant = fillerOccupant(seat.seatIndex);
  }
  return state;
}

/** When Shoot was wrongly parked on B, move the lone real player onto B. */
function migrateLoneRealPlayerToB(state: DiceGameState) {
  const reals = state.seats.filter((s) => s.occupant?.type === 'USER');
  if (reals.length !== 1) return;
  const userSeat = reals[0]!;
  if (userSeat.seatIndex === DICE_SEAT.B) return;
  const bSeat = state.seats.find((s) => s.seatIndex === DICE_SEAT.B);
  if (!bSeat || (bSeat.occupant && !isFillerBot(bSeat.occupant))) return;

  const fromIdx = userSeat.seatIndex;
  const userOcc = userSeat.occupant;
  userSeat.occupant = bSeat.occupant;
  bSeat.occupant = userOcc;
  remapSeatIndex(state, fromIdx, DICE_SEAT.B);
}

function remapSeatIndex(state: DiceGameState, fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return;
  const swap = (i: number) => (i === fromIdx ? toIdx : i === toIdx ? fromIdx : i);
  if (state.activeMatch) {
    state.activeMatch = {
      holderSeatIndex: swap(state.activeMatch.holderSeatIndex),
      opponentSeatIndex: swap(state.activeMatch.opponentSeatIndex),
    };
  }
  if (state.rollerSeatIndex != null) {
    state.rollerSeatIndex = swap(state.rollerSeatIndex);
  }
  if (state.lastWinnerSeatIndex != null) {
    state.lastWinnerSeatIndex = swap(state.lastWinnerSeatIndex);
  }
}

function ensureShootSeated(state: DiceGameState) {
  const reserved = state.seats.find((s) => s.seatIndex === DICE_SEAT.SHOOT);
  if (!reserved) return;
  const existing = state.seats.find((s) => isTigerOccupant(s.occupant));
  const shoot = shootOccupant(state.config.botName);

  if (existing && existing.seatIndex === DICE_SEAT.SHOOT) {
    reserved.occupant = shoot;
    return;
  }

  if (existing && existing.seatIndex !== DICE_SEAT.SHOOT) {
    const fromIdx = existing.seatIndex;
    const displaced = reserved.occupant;
    reserved.occupant = existing.occupant;
    if (displaced?.type === 'USER') {
      existing.occupant = displaced;
    } else if (isTigerOccupant(displaced)) {
      existing.occupant = fillerOccupant(existing.seatIndex);
    } else {
      existing.occupant = isFillerBot(displaced) ? displaced : fillerOccupant(existing.seatIndex);
    }
    if (isTigerOccupant(existing.occupant) && existing.seatIndex !== DICE_SEAT.SHOOT) {
      existing.occupant = fillerOccupant(existing.seatIndex);
    }
    remapSeatIndex(state, fromIdx, DICE_SEAT.SHOOT);
    // Legacy tables parked Shoot on B; pull the lone real onto B opposite Shoot.
    if (fromIdx === DICE_SEAT.B) {
      for (const seat of state.seats) {
        if (seat.seatIndex === DICE_SEAT.SHOOT) continue;
        if (!seat.occupant) seat.occupant = fillerOccupant(seat.seatIndex);
      }
      migrateLoneRealPlayerToB(state);
    }
    return;
  }

  if (reserved.occupant?.type === 'USER') {
    const user = reserved.occupant;
    reserved.occupant = shoot;
    state.seats = assignRealPlayerSeat(state.seats, user);
    return;
  }
  reserved.occupant = shoot;
}

export function seatTigerBot(state: DiceGameState): DiceGameState {
  return syncTableSeats(state);
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
  next.sideBets = next.sideBets.map((sb) => {
    const normalized = normalizePeerBet(sb);
    return {
      id: normalized.id,
      backerUserId: normalized.backerUserId,
      counterpartyUserId: normalized.counterpartyUserId,
      prediction: normalized.prediction,
      amount: normalized.amount,
      status: normalized.status,
      expiresAt: normalized.expiresAt,
      displayAcceptedByUserId:
        normalized.status === 'ACCEPTED'
          ? normalized.displayAcceptedByUserId ?? normalized.counterpartyUserId
          : undefined,
    };
  });
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
  const { holderSeatIndex, opponentSeatIndex } = state.activeMatch!;
  const nextOpponent = findNextSeatAntiClockwise(state.seats, holderSeatIndex, [opponentSeatIndex]);
  if (nextOpponent === null) return null;
  return { holderSeatIndex: opponentSeatIndex, opponentSeatIndex: nextOpponent };
}

export function countRealUsers(seats: DiceSeat[]): number {
  return seats.filter((s) => s.occupant?.type === 'USER').length;
}

/** TIGER always occupies a seat and does not count toward max real players. */
export function diceTableSeatCount(_maxRealPlayers?: number): number {
  return DICE_TABLE_SEAT_COUNT;
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

export function isTigerTargetId(_state: DiceGameState, _targetId: string): boolean {
  return false;
}

export function assignPendingSideBetsToTiger(state: DiceGameState): string[] {
  return assignPendingPeerBetsToSystem(state);
}

export function assignPendingPeerBetsToSystem(state: DiceGameState): string[] {
  const assigned: string[] = [];
  for (const sb of state.sideBets) {
    if (sb.status !== 'PENDING') continue;
    const counterpartyId = getPeerBetCounterpartyId(sb);
    const playerPart = getPeerBetAcceptedAmount(sb);
    finalizePeerBetAcceptance(sb, counterpartyId, playerPart);
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

/** Place a real user in the next join-order chair, replacing a filler bot. Never occupies Shoot. */
export function assignRealPlayerSeat(seats: DiceSeat[], occupant: DiceOccupant): DiceSeat[] {
  const next = seats.map((s) => ({ ...s, occupant: s.occupant ? { ...s.occupant } : null }));
  for (const idx of DICE_JOIN_ORDER) {
    const seat = next.find((s) => s.seatIndex === idx);
    if (!seat) continue;
    if (!seat.occupant || isFillerBot(seat.occupant)) {
      seat.occupant = { ...occupant };
      return next;
    }
  }
  return next;
}

export function removeUserFromSeats(
  seats: DiceSeat[],
  userId: string,
  botName = DEFAULT_DICE_CONFIG.botName,
): DiceSeat[] {
  return seats.map((s) => {
    if (s.occupant?.type === 'USER' && s.occupant.userId === userId) {
      const occupant =
        s.seatIndex === DICE_SEAT.SHOOT ? shootOccupant(botName) : fillerOccupant(s.seatIndex);
      return { ...s, occupant };
    }
    return { ...s, occupant: s.occupant ? { ...s.occupant } : null };
  });
}

export function createInitialState(
  config: DiceGameState['config'],
  maxSeats = diceTableSeatCount(config.maxPlayers),
  nowMs = Date.now(),
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
    interRoundPauseEndsAt: null,
    diceHandoffEndsAt: null,
    finalLockEndsAt: null,
    phaseTimerId: null,
    mainBet: null,
    dice: null,
    roundNumber: 0,
    roundId: '',
    config,
    sideBets: [],
    lastWinnerSeatIndex: null,
    lastHolderStakeAmount: null,
    rollerSeatIndex: null,
    forcedDice: null,
    turnStartedAt: null,
    turnDeadlineAt: null,
    turnTimerId: null,
    nextStandingDieAt: new Date(nowMs + getRandomStandingIntervalMs()).toISOString(),
    lastStandingDieAt: null,
  };
}

export function generateRoundId(): string {
  return `dr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
