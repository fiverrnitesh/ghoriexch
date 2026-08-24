import { DiceGameEngine } from './dice.engine.js';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import { assignSeat, buildInitialMatch, createEmptySeats } from './dice.logic.js';
import { startFinalLockWindow, startSideBetWindow } from './dice.phase-timer.js';
import { startTurnTimer } from './dice.turn-timer.js';
import type { DiceGameState, PlayerChoice } from './dice.types.js';

export const DEFAULT_TEST_SEATS = 6;

export const DEFAULT_TEST_STATE_FIELDS: Pick<
  DiceGameState,
  | 'roomHostUserId'
  | 'gameMode'
  | 'acceptedParticipantIds'
  | 'opponentMatchWindowEndsAt'
  | 'finalLockEndsAt'
  | 'phaseTimerId'
> = {
  roomHostUserId: 'u0',
  gameMode: 'ONLINE',
  acceptedParticipantIds: [],
  opponentMatchWindowEndsAt: null,
  finalLockEndsAt: null,
  phaseTimerId: null,
};

export function buildTable(playerCount: number, sessionId = 'test-session', opts?: {
  hostUserId?: string;
  gameMode?: DiceGameState['gameMode'];
  maxSeats?: number;
}) {
  const engine = new DiceGameEngine();
  const maxSeats = opts?.maxSeats ?? DEFAULT_TEST_SEATS;
  let seats = createEmptySeats(maxSeats);
  for (let i = 0; i < playerCount; i++) {
    seats = assignSeat(seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
  }
  const hostUserId = opts?.hostUserId ?? 'u0';
  const state: DiceGameState = {
    phase: 'BETTING',
    seats,
    maxSeats,
    activeMatch: buildInitialMatch(seats, hostUserId)
      ?? { holderSeatIndex: 0, opponentSeatIndex: playerCount > 2 ? playerCount - 1 : 1 },
    roomHostUserId: hostUserId,
    gameMode: opts?.gameMode ?? 'ONLINE',
    acceptedParticipantIds: Array.from({ length: playerCount }, (_, i) => `u${i}`),
    opponentMatchWindowEndsAt: null,
    sideBetWindowEndsAt: null,
    finalLockEndsAt: null,
    phaseTimerId: null,
    mainBet: null,
    dice: null,
    roundNumber: 1,
    roundId: 'round-1',
    config: { ...DEFAULT_DICE_CONFIG },
    sideBets: [],
    lastWinnerSeatIndex: null,
    rollerSeatIndex: 0,
    forcedDice: null,
    turnStartedAt: null,
    turnDeadlineAt: null,
    turnTimerId: null,
  };
  startTurnTimer(state);
  engine.loadState(sessionId, state);
  return { engine, sessionId, state };
}

/** Place main bet; TIGER auto-matches. Unit tests mark wallets as locked. */
export async function placeAndConfirmMainBet(
  engine: DiceGameEngine,
  sessionId: string,
  holderUserId: string,
  _opponentUserId: string,
  amount: number,
  choice: PlayerChoice = 'ODD',
  nowMs?: number,
) {
  const timePayload = typeof nowMs === 'number' ? { nowMs } : {};
  await engine.processAction({
    sessionId,
    userId: holderUserId,
    action: DICE_ACTIONS.PLACE_MAIN_BET,
    payload: { amount, choice, ...timePayload },
  });
  const afterBet = engine.getInternalState(sessionId)!;
  afterBet.mainBet!.holderLocked = true;
  afterBet.mainBet!.locked = true;
  engine.loadState(sessionId, afterBet);
}

export function openSideBetting(engine: DiceGameEngine, sessionId: string, nowMs = Date.now()) {
  const state = engine.getInternalState(sessionId)!;
  startSideBetWindow(state, state.config.sideBetWindowSeconds, nowMs);
  engine.loadState(sessionId, state);
}

export function openFinalLock(engine: DiceGameEngine, sessionId: string, nowMs = Date.now()) {
  const state = engine.getInternalState(sessionId)!;
  startFinalLockWindow(state, state.config.finalLockSeconds, nowMs);
  engine.loadState(sessionId, state);
}

/** Confirms match lock and opens the 5s roll window. */
export async function lockMainBet(engine: DiceGameEngine, sessionId: string, nowMs?: number) {
  const state = engine.getInternalState(sessionId)!;
  const holderSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
  const oppSeat = state.seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex);
  const holderId = holderSeat?.occupant?.type === 'USER' ? holderSeat.occupant.userId! : holderSeat?.occupant?.botId ?? 'u0';
  const oppId = oppSeat?.occupant?.type === 'USER'
    ? oppSeat.occupant.userId!
    : oppSeat?.occupant?.botId ?? 'tiger';
  const amount = state.mainBet?.amount ?? state.config.minBet;

  if (!state.mainBet) {
    await placeAndConfirmMainBet(engine, sessionId, holderId, oppId, amount, 'ODD', nowMs);
  } else {
    state.mainBet.holderLocked = true;
    state.mainBet.locked = true;
    if (!state.mainBet.opponentStake) {
      state.mainBet.opponentStake = state.mainBet.amount;
      state.mainBet.matchedPool = state.mainBet.amount * 2;
      state.mainBet.opponentBotId = 'tiger';
      state.mainBet.status = 'MATCHED';
    }
    engine.loadState(sessionId, state);
  }

  openFinalLock(engine, sessionId, nowMs);
}
