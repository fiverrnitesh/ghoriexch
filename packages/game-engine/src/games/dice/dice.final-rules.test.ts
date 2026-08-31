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
import {
  buildTable,
  lockMainBet,
  placeAndConfirmMainBet,
  advanceInterRoundPause,
  advanceDiceHandoff,
  advanceFinalLock,
  closeBettingAndRoll,
  closeBettingWindow,
} from './dice.test-helpers.js';

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
  const st = engine.getInternalState(sessionId)!;
  if (st.phase === 'DICE_HANDOFF') {
    await advanceDiceHandoff(engine, sessionId, nowMs);
  }
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
    assert.equal(engine.getInternalState(sessionId)!.phase, 'INTER_ROUND_PAUSE');
    await advanceInterRoundPause(engine, sessionId);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });

  it('first roll no-result → opponent', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    const result = await rollForced(engine, sessionId, 'u0', [1, 4]);
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), false);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.phase, 'DICE_HANDOFF');
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
    assert.equal(st.phase, 'DICE_HANDOFF');
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
  it('30s unified betting deadline is server-authoritative', () => {
    const { engine, sessionId } = buildTable(2);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.config.turnTimeoutSeconds, 30);
    assert.ok(st.turnDeadlineAt);
    assert.equal(isTurnExpired(st, Date.parse(st.turnDeadlineAt) - 1), false);
    assert.equal(isTurnExpired(st, Date.parse(st.turnDeadlineAt)), true);
  });

  it('no main bet at T+30 → auto main bet + FINAL_LOCK', async () => {
    const { engine, sessionId } = buildTable(3);
    const st = engine.getInternalState(sessionId)!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: st.turnTimerId!, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.equal(after.mainBet?.amount, after.config.minBet);
    assert.equal(after.mainBet?.choice, 'ODD');
    assert.equal(after.mainBet?.locked, true);
    assert.ok(after.finalLockEndsAt);
  });

  it('auto main bet uses last holder stake when available', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 250);
    const st = engine.getInternalState(sessionId)!;
    st.forcedDice = [3, 3];
    engine.loadState(sessionId, st);
    await closeBettingAndRoll(engine, sessionId);
    await advanceInterRoundPause(engine, sessionId);
    const next = engine.getInternalState(sessionId)!;
    assert.equal(next.phase, 'BETTING');
    assert.equal(next.lastHolderStakeAmount, 250);
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: {
        turnTimerId: next.turnTimerId!,
        systemTimeout: true,
        nowMs: Date.parse(next.turnDeadlineAt!) + 1,
      },
    });
    const auto = engine.getInternalState(sessionId)!;
    assert.equal(auto.mainBet?.amount, 250);
  });

  it('repeated betting timeouts each open FINAL_LOCK (no silent forfeit)', async () => {
    const { engine, sessionId } = buildTable(4);
    const forceWin = () => {
      const st = engine.getInternalState(sessionId)!;
      st.forcedDice = [3, 3];
      engine.loadState(sessionId, st);
    };
    for (let i = 0; i < 3; i++) {
      let st = engine.getInternalState(sessionId)!;
      if (st.phase === 'INTER_ROUND_PAUSE') await advanceInterRoundPause(engine, sessionId);
      if (st.phase === 'DICE_HANDOFF') await advanceDiceHandoff(engine, sessionId);
      if (st.phase === 'FINAL_LOCK') {
        forceWin();
        await advanceFinalLock(engine, sessionId);
        if (engine.getInternalState(sessionId)!.phase === 'INTER_ROUND_PAUSE') {
          await advanceInterRoundPause(engine, sessionId);
        }
      }
      const current = engine.getInternalState(sessionId)!;
      assert.equal(current.phase, 'BETTING');
      await engine.processAction({
        sessionId,
        userId: 'system',
        action: DICE_ACTIONS.TURN_TIMEOUT,
        payload: {
          turnTimerId: current.turnTimerId!,
          systemTimeout: true,
          nowMs: Date.parse(current.turnDeadlineAt!) + 1,
        },
      });
      assert.equal(engine.getInternalState(sessionId)!.phase, 'DICE_HANDOFF');
      forceWin();
      await advanceFinalLock(engine, sessionId);
      if (engine.getInternalState(sessionId)!.phase === 'INTER_ROUND_PAUSE') {
        await advanceInterRoundPause(engine, sessionId);
      }
    }
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });

  it('30s betting closes into FINAL_LOCK when main bet is placed', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    const st = engine.getInternalState(sessionId)!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: st.turnTimerId!, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.equal(after.config.turnTimeoutSeconds, 30);
    after.forcedDice = [3, 3];
    engine.loadState(sessionId, after);
    await advanceFinalLock(engine, sessionId);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'INTER_ROUND_PAUSE');
  });

  it('full acceptance records counterparty liability', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'sb_full' },
    });
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_full', amount: 50 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.counterpartyAcceptedAmount, 50);
    assert.equal(sb.systemLiability, 0);
  });

  it('partial acceptance splits counterparty and system liability', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u0', prediction: 'LOSS', amount: 2000, sideBetId: 'sb_part' },
    });
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_part', amount: 800, availableBalance: 1000 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.counterpartyAcceptedAmount, 800);
    assert.equal(sb.systemLiability, 1200);
    assert.equal(sb.status, 'ACCEPTED');
  });

  it('insufficient balance caps accept and assigns remainder to TIGER', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u0', prediction: 'WIN', amount: 2000, sideBetId: 'sb_cap' },
    });
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_cap', amount: 2000, availableBalance: 1000 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.counterpartyAcceptedAmount, 1000);
    assert.equal(sb.systemLiability, 1000);
  });

  it('no unmatched bet after acceptance timeout', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u0', prediction: 'WIN', amount: 40, sideBetId: 'sb_unmatched' },
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

describe('FINAL_LOCK roll window', () => {
  it('closeBettingWindow opens DICE_HANDOFF before FINAL_LOCK', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await closeBettingWindow(engine, sessionId);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'DICE_HANDOFF');
    await advanceDiceHandoff(engine, sessionId);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'FINAL_LOCK');
    assert.ok(engine.getInternalState(sessionId)!.finalLockEndsAt);
  });

  it('FINAL_LOCK timeout performs roll', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await closeBettingWindow(engine, sessionId);
    await advanceDiceHandoff(engine, sessionId);
    const st = engine.getInternalState(sessionId)!;
    st.forcedDice = [1, 1];
    engine.loadState(sessionId, st);
    await advanceFinalLock(engine, sessionId);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'INTER_ROUND_PAUSE');
  });

  it('holder manual ROLL_DICE in FINAL_LOCK succeeds', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    await lockMainBet(engine, sessionId);
    const st = engine.getInternalState(sessionId)!;
    st.forcedDice = [3, 3];
    engine.loadState(sessionId, st);
    const roll = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: {},
    });
    assert.equal(roll.events.some((e) => e.type === 'dice:result'), true);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'INTER_ROUND_PAUSE');
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
    assert.equal(st.maxSeats, 8);
    assert.equal(st.seats.filter((s) => s.occupant).length, 8);
    assert.equal(st.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
  });
});
