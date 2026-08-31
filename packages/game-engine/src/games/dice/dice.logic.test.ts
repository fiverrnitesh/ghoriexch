import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMainBet,
  computeMatchedPoolSettlement,
  rollDie,
  rollDicePair,
  findNextSeatAntiClockwise,
  buildInitialMatch,
  rotateAfterWin,
  rotateAfterLoss,
  createEmptySeats,
  assignSeat,
  assignRealPlayerSeat,
  shouldAddTigerBot,
  hasTigerBot,
  isFillerBot,
  diceTableSeatCount,
  createInitialState,
  resolveMainBetChoice,
  seatTigerBot,
  countOccupants,
  countRealUsers,
  removeUserFromSeats,
} from './dice.logic.js';
import { DEFAULT_DICE_CONFIG, DICE_SEAT, DICE_JOIN_ORDER } from './dice.constants.js';
import type { DiceGameState, DiceSeat, DieFace } from './dice.types.js';

const config = { ...DEFAULT_DICE_CONFIG };
const STAKE = 100;

function evalHolder(die1: DieFace, die2: DieFace, choice: 'ODD' | 'EVEN' = 'ODD') {
  return evaluateMainBet(die1, die2, choice, STAKE, STAKE);
}

describe('matched pool settlement — $100 vs $100', () => {
  it('TEST 1: A wins (1+1 ODD) — pool $200, fee $20, payout $180, A net +$80, B net -$100', () => {
    const r = evalHolder(1, 1, 'ODD');
    assert.equal(r.outcome, 'WIN');
    assert.equal(r.matchedPool, 200);
    assert.equal(r.adminFee, 20);
    assert.equal(r.winnerPayout, 180);
    assert.equal(r.payout, 180);
    assert.equal(r.holderNet, 80);
    assert.equal(r.opponentNet, -100);
    assert.equal(r.loserLoss, 100);
    assert.equal(r.winnerPayout + r.adminFee, r.matchedPool);
  });

  it('TEST 2: B wins (holder loses on 4+4 EVEN vs ODD) — B payout $180, B net +$80, A net -$100', () => {
    const r = evalHolder(4, 4, 'ODD');
    assert.equal(r.outcome, 'LOSS');
    assert.equal(r.matchedPool, 200);
    assert.equal(r.adminFee, 20);
    assert.equal(r.winnerPayout, 180);
    assert.equal(r.holderNet, -100);
    assert.equal(r.opponentNet, 80);
    assert.equal(r.loserLoss, 100);
    assert.equal(r.winnerPayout + r.adminFee, r.matchedPool);
  });
});

describe('evaluateMainBet — winning pairs', () => {
  it('TEST 3: 1+1 with ODD wins', () => {
    const r = evalHolder(1, 1, 'ODD');
    assert.equal(r.outcome, 'WIN');
    assert.equal(r.winnerPayout, 180);
    assert.equal(r.holderNet, 80);
  });

  it('3+3 with ODD wins', () => {
    assert.equal(evalHolder(3, 3, 'ODD').outcome, 'WIN');
  });

  it('TEST 4: 4+4 with EVEN wins', () => {
    const r = evalHolder(4, 4, 'EVEN');
    assert.equal(r.outcome, 'WIN');
    assert.equal(r.winnerPayout, 180);
  });

  it('6+6 with EVEN wins', () => {
    assert.equal(evalHolder(6, 6, 'EVEN').outcome, 'WIN');
  });
});

describe('evaluateMainBet — blank rules', () => {
  it('BLANK+1 → PAO/ODD', () => {
    assert.equal(evalHolder('BLANK', 1, 'ODD').outcome, 'WIN');
    assert.equal(evalHolder(1, 'BLANK', 'ODD').outcome, 'WIN');
    assert.equal(evalHolder('BLANK', 1, 'EVEN').outcome, 'LOSS');
  });

  it('BLANK+3 → PAO/ODD', () => {
    assert.equal(evalHolder('BLANK', 3, 'ODD').outcome, 'WIN');
    assert.equal(evalHolder('BLANK', 3, 'EVEN').outcome, 'LOSS');
  });

  it('BLANK+4 → EVEN', () => {
    assert.equal(evalHolder('BLANK', 4, 'EVEN').outcome, 'WIN');
    assert.equal(evalHolder('BLANK', 4, 'ODD').outcome, 'LOSS');
  });

  it('BLANK+6 → EVEN', () => {
    assert.equal(evalHolder('BLANK', 6, 'EVEN').outcome, 'WIN');
    assert.equal(evalHolder(6, 'BLANK', 'EVEN').outcome, 'WIN');
  });
});

describe('evaluateMainBet — non-matching numbers', () => {
  const cases: Array<[DieFace, DieFace]> = [
    [1, 3], [1, 4], [1, 6], [3, 4], [3, 6], [4, 6],
  ];
  for (const [a, b] of cases) {
    it(`${a}+${b} = NO_RESULT`, () => {
      assert.equal(evalHolder(a, b, 'ODD').outcome, 'NO_RESULT');
      assert.equal(evalHolder(a, b, 'EVEN').outcome, 'NO_RESULT');
      assert.equal(evalHolder(a, b, 'ODD').matchedPool, 0);
      assert.equal(evalHolder(a, b, 'ODD').adminFee, 0);
    });
  }

  it('1+3 sum is 4 but must NOT win EVEN (matching rule)', () => {
    const r = evalHolder(1, 3, 'EVEN');
    assert.equal(r.matchingNumber, null);
    assert.equal(r.parity, null);
    assert.equal(r.outcome, 'NO_RESULT');
  });

  for (const [a, b] of cases) {
    it(`${b}+${a} order-independent NO_RESULT`, () => {
      assert.equal(evalHolder(b, a, 'ODD').outcome, 'NO_RESULT');
      assert.equal(evalHolder(b, a, 'EVEN').outcome, 'NO_RESULT');
    });
  }
});

describe('evaluateMainBet — wrong parity on matching pair', () => {
  it('1+1 with EVEN loses', () => {
    assert.equal(evalHolder(1, 1, 'EVEN').outcome, 'LOSS');
  });
  it('4+4 with ODD loses', () => {
    assert.equal(evalHolder(4, 4, 'ODD').outcome, 'LOSS');
  });
});

describe('computeMatchedPoolSettlement — rounding', () => {
  it('payout + fee always equals pool', () => {
    for (const stake of [10, 25, 33, 50, 100, 999]) {
      const { matchedPool, adminFee, winnerPayout } = computeMatchedPoolSettlement(stake, stake);
      assert.equal(winnerPayout + adminFee, matchedPool);
    }
  });

  it('TEST 10: accounting reconciliation for $100 vs $100', () => {
    const win = evalHolder(1, 1, 'ODD');
    assert.equal(win.holderStake + win.opponentStake, win.winnerPayout + win.adminFee);
    assert.equal(win.holderNet + win.opponentNet + win.adminFee, 0);

    const loss = evalHolder(4, 4, 'ODD');
    assert.equal(loss.holderStake + loss.opponentStake, loss.winnerPayout + loss.adminFee);
    assert.equal(loss.holderNet + loss.opponentNet + loss.adminFee, 0);
  });
});

describe('custom die faces', () => {
  it('rollDie only returns valid faces', () => {
    const valid = new Set([1, 3, 4, 6, 'BLANK']);
    for (let i = 0; i < 200; i++) {
      assert.ok(valid.has(rollDie()));
    }
  });

  it('BLANK+BLANK is impossible from rollDicePair', () => {
    for (let i = 0; i < 400; i++) {
      const [a, b] = rollDicePair();
      assert.equal(a === 'BLANK' && b === 'BLANK', false);
    }
  });

  it('rollDicePair rerolls when both faces would be blank', () => {
    let n = 0;
    const rng = () => {
      n += 1;
      if (n <= 2) return 0.9;
      return 0.01;
    };
    const [a, b] = rollDicePair(rng);
    assert.equal(a === 'BLANK' && b === 'BLANK', false);
  });
});

describe('default main-bet choice', () => {
  it('omitted choice / no PAO = EVEN', () => {
    assert.equal(resolveMainBetChoice({}), 'EVEN');
    assert.equal(resolveMainBetChoice({ choice: 'EVEN' }), 'EVEN');
  });
  it('PAO or ODD = ODD', () => {
    assert.equal(resolveMainBetChoice({ pao: true }), 'ODD');
    assert.equal(resolveMainBetChoice({ choice: 'ODD' }), 'ODD');
  });
});

function seatsWithPlayers(count: number): DiceSeat[] {
  let seats = createEmptySeats(6);
  for (let i = 0; i < count; i++) {
    seats = assignSeat(seats, { type: 'USER', userId: `u${i}`, name: `Player${i}` });
  }
  return seats;
}

describe('anti-clockwise rotation', () => {
  it('2 players — alternates correctly', () => {
    const seats = seatsWithPlayers(2);
    const match = buildInitialMatch(seats)!;
    assert.equal(match.holderSeatIndex, 0);
    assert.equal(match.opponentSeatIndex, 1);

    const state: DiceGameState = {
      ...createInitialState(config),
      seats,
      activeMatch: match,
    };

    const afterWin = rotateAfterWin(state)!;
    assert.equal(afterWin.holderSeatIndex, 0);
    assert.equal(afterWin.opponentSeatIndex, 1);

    const afterLoss = rotateAfterLoss(state)!;
    assert.equal(afterLoss.holderSeatIndex, 1);
    assert.equal(afterLoss.opponentSeatIndex, 0);
  });

  it('4 players — winner keeps dice, next opponent anti-clockwise', () => {
    const seats = seatsWithPlayers(4);
    const match = buildInitialMatch(seats)!;
    assert.equal(match.holderSeatIndex, 0);
    assert.equal(match.opponentSeatIndex, 3);

    const state: DiceGameState = { ...createInitialState(config), seats, activeMatch: match };
    const afterWin = rotateAfterWin(state)!;
    assert.equal(afterWin.holderSeatIndex, 0);
    assert.equal(afterWin.opponentSeatIndex, 2);

    state.activeMatch = { holderSeatIndex: 0, opponentSeatIndex: 2 };
    const afterWin2 = rotateAfterWin(state)!;
    assert.equal(afterWin2.opponentSeatIndex, 1);
  });

  it('6 players rotation', () => {
    const seats = seatsWithPlayers(6);
    const match = buildInitialMatch(seats)!;
    const state: DiceGameState = { ...createInitialState(config), seats, activeMatch: match };
    assert.equal(match.opponentSeatIndex, 5);
    const next = rotateAfterWin(state)!;
    assert.equal(next.holderSeatIndex, 0);
    assert.equal(next.opponentSeatIndex, 4);
  });

  it('findNextSeatAntiClockwise from seat 2 in 4-player table', () => {
    const seats = seatsWithPlayers(4);
    assert.equal(findNextSeatAntiClockwise(seats, 2, [2]), 1);
    assert.equal(findNextSeatAntiClockwise(seats, 0, [0]), 3);
  });
});

describe('3 players rotation', () => {
  it('A vs C, A wins, A continues vs B (anti-clockwise from A)', () => {
    const seats = seatsWithPlayers(3);
    const state: DiceGameState = {
      ...createInitialState(config),
      seats,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 2 },
    };
    const next = rotateAfterWin(state)!;
    assert.equal(next.holderSeatIndex, 0);
    assert.equal(next.opponentSeatIndex, 1);
  });

  it('C wins, C becomes holder vs next anti-clockwise', () => {
    const seats = seatsWithPlayers(3);
    const state: DiceGameState = {
      ...createInitialState(config),
      seats,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 2 },
    };
    const next = rotateAfterLoss(state)!;
    assert.equal(next.holderSeatIndex, 2);
    assert.equal(next.opponentSeatIndex, 1);
  });
});

describe('TIGER bot rules', () => {
  it('adds TIGER when only 1 real user', () => {
    const seats = assignSeat(createEmptySeats(6), { type: 'USER', userId: 'u1', name: 'Solo' });
    assert.equal(shouldAddTigerBot(seats, 6), true);
  });

  it('adds TIGER when 2 real users present and no bot yet', () => {
    let seats = assignSeat(createEmptySeats(6), { type: 'USER', userId: 'u1', name: 'A' });
    seats = assignSeat(seats, { type: 'USER', userId: 'u2', name: 'B' });
    assert.equal(shouldAddTigerBot(seats, 6), true);
  });

  it('adds TIGER in FRIENDS mode', () => {
    const seats = assignSeat(createEmptySeats(6), { type: 'USER', userId: 'u1', name: 'Solo' });
    assert.equal(shouldAddTigerBot(seats, 6, 'FRIENDS'), true);
  });

  it('does not add second TIGER when bot already seated', () => {
    let seats = assignSeat(createEmptySeats(6), { type: 'USER', userId: 'u1', name: 'A' });
    seats = assignSeat(seats, { type: 'BOT', botId: 'tiger', name: 'TIGER' });
    assert.equal(shouldAddTigerBot(seats, 6), false);
  });

  it('table is always 8 seats (7 real + Shoot)', () => {
    assert.equal(diceTableSeatCount(7), 8);
    assert.equal(diceTableSeatCount(8), 8);
  });

  it('createSession table is Shoot + 7 filler bots before anyone joins', () => {
    const state = createInitialState(config);
    seatTigerBot(state);
    assert.equal(hasTigerBot(state.seats), true);
    assert.equal(countOccupants(state.seats), 8);
    assert.equal(countRealUsers(state.seats), 0);
    assert.equal(state.seats.filter((s) => isFillerBot(s.occupant)).length, 7);
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.SHOOT)?.occupant?.botId, 'tiger');
    assert.equal(state.activeMatch, null);
  });
});

function ovalState(realCount = 0) {
  const state = createInitialState(config);
  seatTigerBot(state);
  for (let i = 0; i < realCount; i++) {
    state.seats = assignRealPlayerSeat(state.seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
  }
  return state;
}

describe('oval seating — join order and rotation', () => {
  it('findNextSeatAntiClockwise matches the oval ring', () => {
    const seats = ovalState().seats;
    assert.equal(findNextSeatAntiClockwise(seats, DICE_SEAT.SHOOT, [DICE_SEAT.SHOOT]), DICE_SEAT.D);
    assert.equal(findNextSeatAntiClockwise(seats, DICE_SEAT.D, [DICE_SEAT.D]), DICE_SEAT.E);
    assert.equal(findNextSeatAntiClockwise(seats, DICE_SEAT.B, [DICE_SEAT.B]), DICE_SEAT.C);
  });

  it('first real sits at B opposite Shoot; match is B vs Shoot', () => {
    const state = ovalState(1);
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.B)?.occupant?.userId, 'u0');
    assert.equal(countOccupants(state.seats), 8);
    assert.equal(countRealUsers(state.seats), 1);
    assert.equal(state.seats.filter((s) => isFillerBot(s.occupant)).length, 6);
    const match = buildInitialMatch(state.seats)!;
    assert.equal(match.holderSeatIndex, DICE_SEAT.B);
    assert.equal(match.opponentSeatIndex, DICE_SEAT.SHOOT);
  });

  it('join order is B, C, D, F, E, G, H', () => {
    const state = ovalState(7);
    const expected = [...DICE_JOIN_ORDER];
    for (let i = 0; i < expected.length; i++) {
      const seat = state.seats.find((s) => s.occupant?.type === 'USER' && s.occupant.userId === `u${i}`);
      assert.equal(seat?.seatIndex, expected[i]);
    }
    assert.equal(countRealUsers(state.seats), 7);
    assert.equal(state.seats.filter((s) => isFillerBot(s.occupant)).length, 0);
    assert.equal(hasTigerBot(state.seats), true);
  });

  it('leaving B refills that chair with a filler; others stay put', () => {
    const state = ovalState(3);
    const c = state.seats.find((s) => s.seatIndex === DICE_SEAT.C)?.occupant;
    const d = state.seats.find((s) => s.seatIndex === DICE_SEAT.D)?.occupant;
    state.seats = removeUserFromSeats(state.seats, 'u0');
    assert.equal(isFillerBot(state.seats.find((s) => s.seatIndex === DICE_SEAT.B)?.occupant), true);
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.C)?.occupant?.userId, c?.userId);
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.D)?.occupant?.userId, d?.userId);
    assert.equal(countOccupants(state.seats), 8);
    assert.equal(countRealUsers(state.seats), 2);
  });

  it('B beats Shoot → B vs D; then E', () => {
    const state: DiceGameState = { ...ovalState(1), activeMatch: { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT } };
    const afterShoot = rotateAfterWin(state)!;
    assert.deepEqual(afterShoot, { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.D });
    state.activeMatch = afterShoot;
    const afterD = rotateAfterWin(state)!;
    assert.deepEqual(afterD, { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.E });
  });

  it('B win loop: D → E → G → C → F → H → Shoot', () => {
    const state: DiceGameState = { ...ovalState(1), activeMatch: { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT } };
    const expected = [DICE_SEAT.D, DICE_SEAT.E, DICE_SEAT.G, DICE_SEAT.C, DICE_SEAT.F, DICE_SEAT.H, DICE_SEAT.SHOOT];
    for (const next of expected) {
      const match = rotateAfterWin(state)!;
      assert.equal(match.holderSeatIndex, DICE_SEAT.B);
      assert.equal(match.opponentSeatIndex, next);
      state.activeMatch = match;
    }
  });

  it('B loses to Shoot → Shoot vs C', () => {
    const state: DiceGameState = { ...ovalState(1), activeMatch: { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT } };
    const next = rotateAfterLoss(state)!;
    assert.deepEqual(next, { holderSeatIndex: DICE_SEAT.SHOOT, opponentSeatIndex: DICE_SEAT.C });
  });

  it('B beats Shoot then loses to D → D vs C', () => {
    const state: DiceGameState = { ...ovalState(1), activeMatch: { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT } };
    state.activeMatch = rotateAfterWin(state)!;
    assert.deepEqual(state.activeMatch, { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.D });
    const afterLoss = rotateAfterLoss(state)!;
    assert.deepEqual(afterLoss, { holderSeatIndex: DICE_SEAT.D, opponentSeatIndex: DICE_SEAT.C });
  });

  it('does not start a match with zero real players', () => {
    const state = ovalState(0);
    assert.equal(buildInitialMatch(state.seats), null);
  });

  it('repairs legacy tiger@0 / user@1 into B vs Shoot', () => {
    const state = createInitialState(config);
    state.seats = createEmptySeats(8);
    state.seats[0]!.occupant = { type: 'BOT', botId: 'tiger', name: 'Shoot' };
    state.seats[1]!.occupant = { type: 'USER', userId: 'u0', name: 'Player One' };
    state.activeMatch = { holderSeatIndex: 1, opponentSeatIndex: 0 };
    seatTigerBot(state);
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.B)?.occupant?.userId, 'u0');
    assert.equal(state.seats.find((s) => s.seatIndex === DICE_SEAT.SHOOT)?.occupant?.botId, 'tiger');
    assert.equal(countOccupants(state.seats), 8);
    assert.deepEqual(state.activeMatch, { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT });
  });

  it('with self at B, absolute seats map to diagram positions', () => {
    // Mirrors apps/web seatPositions CLOCKWISE_FROM_B (visual slot ids).
    const SLOT = { P1: 0, P5: 1, P4: 2, P2: 3, P7: 4, P6: 5, P8: 6, P3: 7 };
    const CLOCKWISE_FROM_B = [SLOT.P1, SLOT.P5, SLOT.P4, SLOT.P3, SLOT.P2, SLOT.P7, SLOT.P6, SLOT.P8];
    const expected: Record<number, number> = {
      [DICE_SEAT.B]: SLOT.P1, // bottom
      [DICE_SEAT.G]: SLOT.P5, // bottom-left
      [DICE_SEAT.E]: SLOT.P4, // left
      [DICE_SEAT.D]: SLOT.P3, // top-left
      [DICE_SEAT.SHOOT]: SLOT.P2, // top
      [DICE_SEAT.H]: SLOT.P7, // top-right
      [DICE_SEAT.F]: SLOT.P6, // right
      [DICE_SEAT.C]: SLOT.P8, // bottom-right
    };
    for (const [seat, slot] of Object.entries(expected)) {
      const seatIndex = Number(seat);
      assert.equal(CLOCKWISE_FROM_B[seatIndex], slot);
    }
  });
});

describe('anti-clockwise rotation — player counts 3–6', () => {
  for (const count of [3, 4, 5, 6]) {
    it(`${count} players — winner keeps dice, next opponent anti-clockwise`, () => {
      const seats = seatsWithPlayers(count);
      const match = buildInitialMatch(seats)!;
      assert.equal(match.holderSeatIndex, 0);
      assert.equal(match.opponentSeatIndex, count - 1);

      const state: DiceGameState = { ...createInitialState(config), seats, activeMatch: match };
      const afterWin = rotateAfterWin(state)!;
      assert.equal(afterWin.holderSeatIndex, 0);
      assert.equal(afterWin.opponentSeatIndex, count - 2);

      const lossState: DiceGameState = { ...state, activeMatch: match };
      const afterLoss = rotateAfterLoss(lossState)!;
      assert.equal(afterLoss.holderSeatIndex, count - 1);
      assert.equal(afterLoss.opponentSeatIndex, count - 2);
    });
  }
});

describe('platform fee rate configuration', () => {
  it('uses platformFeeRate from config', () => {
    const r = evaluateMainBet(1, 1, 'ODD', 100, 100, 0.15);
    assert.equal(r.matchedPool, 200);
    assert.equal(r.adminFee, 30);
    assert.equal(r.winnerPayout, 170);
    assert.equal(r.winnerPayout + r.adminFee, r.matchedPool);
  });
});
