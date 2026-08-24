import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiceGameEngine } from './dice.engine.js';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import {
  evaluateMainBet,
  getActiveRollerActorId,
  rollDicePair,
  rotateAfterLoss,
  rotateAfterWin,
  createEmptySeats,
  assignSeat,
  createInitialState,
} from './dice.logic.js';
import { isTurnExpired } from './dice.turn-timer.js';
import { isPhaseExpired } from './dice.phase-timer.js';
import type { DiceGameState, DieFace } from './dice.types.js';
import { buildTable, lockMainBet, openSideBetting, placeAndConfirmMainBet } from './dice.test-helpers.js';

const STAKE = 100;

function evalPair(a: DieFace, b: DieFace, choice: 'ODD' | 'EVEN' = 'ODD') {
  return evaluateMainBet(a, b, choice, STAKE, STAKE);
}

async function rollForced(
  engine: DiceGameEngine,
  sessionId: string,
  userId: string,
  dice: [DieFace, DieFace],
  nowMs?: number,
) {
  await engine.processAction({
    sessionId,
    userId,
    action: DICE_ACTIONS.FORCE_DICE,
    payload: { dice },
  });
  return engine.processAction({
    sessionId,
    userId,
    action: DICE_ACTIONS.ROLL_DICE,
    payload: userId === 'tiger' ? { botAction: true, nowMs } : { nowMs },
  });
}

describe('FINAL dice faces', () => {
  it('1+1 → PAO', () => assert.equal(evalPair(1, 1, 'ODD').outcome, 'WIN'));
  it('3+3 → PAO', () => assert.equal(evalPair(3, 3, 'ODD').outcome, 'WIN'));
  it('4+4 → EVEN', () => assert.equal(evalPair(4, 4, 'EVEN').outcome, 'WIN'));
  it('6+6 → EVEN', () => assert.equal(evalPair(6, 6, 'EVEN').outcome, 'WIN'));
  it('BLANK+1 → PAO', () => assert.equal(evalPair('BLANK', 1, 'ODD').outcome, 'WIN'));
  it('BLANK+3 → PAO', () => assert.equal(evalPair('BLANK', 3, 'ODD').outcome, 'WIN'));
  it('BLANK+4 → EVEN', () => assert.equal(evalPair('BLANK', 4, 'EVEN').outcome, 'WIN'));
  it('BLANK+6 → EVEN', () => assert.equal(evalPair('BLANK', 6, 'EVEN').outcome, 'WIN'));
  it('BLANK+BLANK impossible', () => {
    for (let i = 0; i < 300; i++) {
      const [a, b] = rollDicePair();
      assert.equal(a === 'BLANK' && b === 'BLANK', false);
    }
  });
  it('1+3 → no result', () => assert.equal(evalPair(1, 3).outcome, 'NO_RESULT'));
  it('1+4 → no result', () => assert.equal(evalPair(1, 4).outcome, 'NO_RESULT'));
  it('3+6 → no result', () => assert.equal(evalPair(3, 6).outcome, 'NO_RESULT'));
  it('4+6 → no result', () => assert.equal(evalPair(4, 6).outcome, 'NO_RESULT'));
});

describe('FINAL multi-roll', () => {
  it('first roll resolves', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    const result = await rollForced(engine, sessionId, 'u0', [1, 1]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), true);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });

  it('first roll no-result → opponent', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    const result = await rollForced(engine, sessionId, 'u0', [1, 4]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), false);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.phase, 'FINAL_LOCK');
    assert.equal(st.rollerSeatIndex, st.activeMatch!.opponentSeatIndex);
    assert.equal(getActiveRollerActorId(st), 'u1');
  });

  it('two consecutive no-results pass dice back', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    await rollForced(engine, sessionId, 'u0', [1, 3]);
    await rollForced(engine, sessionId, 'u1', [3, 6]);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.phase, 'FINAL_LOCK');
    assert.equal(getActiveRollerActorId(st), 'u0');
    assert.equal(st.mainBet?.amount, 100);
  });

  it('three-roll sequence then result', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'EVEN');
    await lockMainBet(engine, sessionId);
    await rollForced(engine, sessionId, 'u0', [1, 4]);
    await rollForced(engine, sessionId, 'u1', [3, 6]);
    const result = await rollForced(engine, sessionId, 'u0', [4, 4]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), true);
    const settlement = result.events.find((e) => e.type === 'dice:settlement')!;
    assert.equal((settlement.payload.result as { outcome: string }).outcome, 'WIN');
  });

  it('BLANK on later roll ends the round', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'EVEN');
    await lockMainBet(engine, sessionId);
    await rollForced(engine, sessionId, 'u0', [1, 3]);
    const result = await rollForced(engine, sessionId, 'u1', ['BLANK', 6]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), true);
    assert.equal((result.events.find((e) => e.type === 'dice:settlement')!.payload.result as { outcome: string }).outcome, 'WIN');
  });

  it('rotation after final result', async () => {
    const { engine, sessionId } = buildTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u3', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    await rollForced(engine, sessionId, 'u0', [1, 4]);
    await rollForced(engine, sessionId, 'u3', [4, 4]);
    assert.deepEqual(engine.getInternalState(sessionId)!.activeMatch, {
      holderSeatIndex: 3,
      opponentSeatIndex: 2,
    });
  });
});

describe('FINAL betting windows', () => {
  it('15s betting deadline is server-authoritative', () => {
    const { engine, sessionId } = buildTable(2);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.config.turnTimeoutSeconds, 15);
    assert.ok(st.turnDeadlineAt);
    assert.equal(isTurnExpired(st, Date.parse(st.turnDeadlineAt) - 1), false);
    assert.equal(isTurnExpired(st, Date.parse(st.turnDeadlineAt)), true);
  });

  it('no bet → skip player and next player gets a new 15s window', async () => {
    const { engine, sessionId } = buildTable(3);
    const st = engine.getInternalState(sessionId)!;
    const holderBefore = st.activeMatch!.holderSeatIndex;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: st.turnTimerId!, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.notEqual(after.activeMatch!.holderSeatIndex, holderBefore);
    assert.equal(after.phase, 'BETTING');
    assert.equal(after.mainBet, null);
    assert.ok(after.turnDeadlineAt);
    assert.equal(after.config.turnTimeoutSeconds, 15);
  });

  it('repeated skipped turns keep rotating', async () => {
    const { engine, sessionId } = buildTable(4);
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      const st = engine.getInternalState(sessionId)!;
      seen.add(st.activeMatch!.holderSeatIndex);
      await engine.processAction({
        sessionId,
        userId: 'system',
        action: DICE_ACTIONS.TURN_TIMEOUT,
        payload: { turnTimerId: st.turnTimerId!, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
      });
    }
    assert.ok(seen.size >= 3);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });

  it('10s acceptance deadline after betting closes', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    const st = engine.getInternalState(sessionId)!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: st.turnTimerId!, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
    });
    const accept = engine.getInternalState(sessionId)!;
    assert.equal(accept.phase, 'SIDE_BETTING');
    assert.equal(accept.config.sideBetWindowSeconds, 10);
    assert.ok(accept.sideBetWindowEndsAt);
  });

  it('full acceptance records player liability', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'sb_full' },
    });
    openSideBetting(engine, sessionId);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_full', amount: 50 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.playerAcceptedAmount, 50);
    assert.equal(sb.tigerLiability, 0);
  });

  it('partial acceptance splits player and TIGER liability', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'LOSS', amount: 2000, sideBetId: 'sb_part' },
    });
    openSideBetting(engine, sessionId);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_part', amount: 800, availableBalance: 1000 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.playerAcceptedAmount, 800);
    assert.equal(sb.tigerLiability, 1200);
    assert.equal(sb.status, 'ACCEPTED');
  });

  it('insufficient balance caps accept and assigns remainder to TIGER', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 2000, sideBetId: 'sb_cap' },
    });
    openSideBetting(engine, sessionId);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_cap', amount: 2000, availableBalance: 1000 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.playerAcceptedAmount, 1000);
    assert.equal(sb.tigerLiability, 1000);
  });

  it('no unmatched bet after acceptance timeout', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 40, sideBetId: 'sb_unmatched' },
    });
    engine.expirePendingSideBets(sessionId);
    const pending = engine.getInternalState(sessionId)!.sideBets.filter((s) => s.status === 'PENDING');
    assert.equal(pending.length, 0);
    assert.equal(engine.getInternalState(sessionId)!.sideBets[0]!.status, 'ACCEPTED');
  });
});

describe('FINAL roll window', () => {
  it('5s manual roll window then auto-roll', async () => {
    const { engine, sessionId } = buildTable(2);
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', now);
    await lockMainBet(engine, sessionId, now);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.config.finalLockSeconds, 5);
    assert.equal(isPhaseExpired(st, now + 4999), false);
    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.PHASE_TIMEOUT,
      payload: { phaseTimerId: st.phaseTimerId!, systemTimeout: true, nowMs: now + 5000 },
    });
    assert.ok(result.events.some((e) => e.type === 'dice:result'));
  });

  it('duplicate roll rejected', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await lockMainBet(engine, sessionId);
    await rollForced(engine, sessionId, 'u0', [1, 1]);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Dice roll not available|not locked|Main bet/,
    );
  });

  it('wrong player cannot roll', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await lockMainBet(engine, sessionId);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Only active dice player/,
    );
  });
});

describe('FINAL finance', () => {
  it('90/10 settlement on a resolved round', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    const result = await rollForced(engine, sessionId, 'u0', [1, 1]);
    const settlement = result.events.find((e) => e.type === 'dice:settlement')!.payload.result as {
      matchedPool: number; adminFee: number; winnerPayout: number; outcome: string;
    };
    assert.equal(settlement.outcome, 'WIN');
    assert.equal(settlement.matchedPool, 200);
    assert.equal(settlement.adminFee, 20);
    assert.equal(settlement.winnerPayout, 180);
  });

  it('no-result does not settle', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await lockMainBet(engine, sessionId);
    const result = await rollForced(engine, sessionId, 'u0', [1, 3]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), false);
    assert.ok(engine.getInternalState(sessionId)!.mainBet);
  });
});

describe('FINAL rotation 2–6 with TIGER', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    it(`${count} occupied seats rotate after a loss`, () => {
      let seats = createEmptySeats(6);
      for (let i = 0; i < count; i++) {
        seats = assignSeat(seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
      }
      const state: DiceGameState = {
        ...createInitialState(DEFAULT_DICE_CONFIG),
        seats,
        activeMatch: { holderSeatIndex: 0, opponentSeatIndex: count - 1 },
      };
      const afterWin = rotateAfterWin(state)!;
      assert.equal(afterWin.holderSeatIndex, 0);
      const afterLoss = rotateAfterLoss(state)!;
      assert.equal(afterLoss.holderSeatIndex, count - 1);
    });
  }

  it('TIGER participates in rotation as a normal occupant', () => {
    let seats = createEmptySeats(6);
    seats = assignSeat(seats, { type: 'USER', userId: 'u0', name: 'A' });
    seats = assignSeat(seats, { type: 'BOT', botId: 'tiger', name: 'TIGER' });
    const state: DiceGameState = {
      ...createInitialState(DEFAULT_DICE_CONFIG),
      seats,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
    };
    const afterLoss = rotateAfterLoss(state)!;
    assert.equal(afterLoss.holderSeatIndex, 1);
    assert.equal(afterLoss.opponentSeatIndex, 0);
  });
});

describe('FINAL persistence / stale timers', () => {
  it('refresh preserves betting deadline', () => {
    const { engine, sessionId } = buildTable(2);
    const st = engine.getInternalState(sessionId)!;
    const deadline = st.turnDeadlineAt;
    engine.loadState(sessionId, structuredClone(st));
    assert.equal(engine.getInternalState(sessionId)!.turnDeadlineAt, deadline);
  });

  it('stale turnTimerId cannot forfeit a newer turn', async () => {
    const { engine, sessionId } = buildTable(2);
    const stale = engine.getInternalState(sessionId)!.turnTimerId!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: Date.parse(engine.getInternalState(sessionId)!.turnDeadlineAt!) + 1 },
    });
    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: Date.now() + 60_000 },
    });
    assert.equal(result.events.length, 0);
  });
});

describe('FINAL TIGER seating', () => {
  it('createSession seats TIGER before the first human joins', async () => {
    const engine = new DiceGameEngine();
    const { sessionId } = await engine.createSession({
      hostUserId: 'host',
      config: DEFAULT_DICE_CONFIG as unknown as Record<string, unknown>,
    });
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.maxSeats, 7);
    assert.equal(st.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
  });
});
