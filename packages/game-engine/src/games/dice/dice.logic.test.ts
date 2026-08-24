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
  shouldAddTigerBot,
  diceTableSeatCount,
  createInitialState,
  resolveMainBetChoice,
} from './dice.logic.js';
import { DEFAULT_DICE_CONFIG } from './dice.constants.js';
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

  it('TIGER seat is reserved beyond the 6 real-player cap', () => {
    assert.equal(diceTableSeatCount(6), 7);
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
