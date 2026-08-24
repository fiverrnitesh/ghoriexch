import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiceGameEngine } from './dice.engine.js';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import { assignSeat, createEmptySeats } from './dice.logic.js';
import { startTurnTimer, isTurnExpired } from './dice.turn-timer.js';
import { startFinalLockWindow } from './dice.phase-timer.js';
import type { DiceGameState } from './dice.types.js';
import { lockMainBet, placeAndConfirmMainBet } from './dice.test-helpers.js';

function loadBettingTable(engine: DiceGameEngine, sessionId: string, playerCount: number, holderSeat = 0, opponentSeat = 1) {
  let seats = createEmptySeats(6);
  for (let i = 0; i < playerCount; i++) {
    seats = assignSeat(seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
  }
  const now = Date.parse('2026-08-16T12:00:00.000Z');
  const state: DiceGameState = {
    phase: 'BETTING',
    seats,
    maxSeats: 6,
    activeMatch: { holderSeatIndex: holderSeat, opponentSeatIndex: opponentSeat },
    roomHostUserId: 'u0',
    gameMode: 'ONLINE',
    acceptedParticipantIds: Array.from({ length: playerCount }, (_, i) => `u${i}`),
    opponentMatchWindowEndsAt: null,
    sideBetWindowEndsAt: null,
    finalLockEndsAt: null,
    phaseTimerId: null,
    mainBet: null,
    dice: null,
    roundNumber: 1,
    roundId: 'timeout-round-1',
    config: { ...DEFAULT_DICE_CONFIG },
    sideBets: [],
    lastWinnerSeatIndex: null,
    rollerSeatIndex: holderSeat,
    forcedDice: null,
    turnStartedAt: null,
    turnDeadlineAt: null,
    turnTimerId: null,
  };
  startTurnTimer(state, now);
  engine.loadState(sessionId, state);
  return { state, now };
}

describe('DiceGameEngine — turn timeout', () => {
  it('2. player acts before 15 seconds — bet and roll succeed', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'before-deadline';
    loadBettingTable(engine, sessionId, 2);
    const before = Date.parse('2026-08-16T12:00:05.000Z');

    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', before - 1000);
    await lockMainBet(engine, sessionId, before - 1000);

    const roll = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: { nowMs: before },
    });
    assert.equal(roll.events.some((e) => e.type === 'dice:result'), true);
  });

  it('4. timeout in BETTING forfeits holder — next player receives turn', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'forfeit-bet';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const timerId = st.turnTimerId!;

    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: now + 16000 },
    });

    assert.ok(result.events.some((e) => e.type === 'dice:turn_timeout'));
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'BETTING');
    assert.equal(after.activeMatch!.holderSeatIndex, 1);
    assert.equal(after.mainBet, null);
  });

  it('5. late PLACE_MAIN_BET rejected after deadline', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'late-bet';
    const { now } = loadBettingTable(engine, sessionId, 2);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'EVEN', nowMs: now + 16000 },
      }),
      /Turn deadline expired/,
    );
  });

  it('5b. late ROLL_DICE rejected before final lock', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'late-roll';
    const { now } = loadBettingTable(engine, sessionId, 2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', now + 1000);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Dice roll not available/,
    );
  });

  it('9. action vs timeout race — only timeout wins when expired', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'race';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const timerId = engine.getInternalState(sessionId)!.turnTimerId!;

    const timeout = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: now + 16000 },
    });
    assert.ok(timeout.events.length > 0);

    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'ODD', nowMs: now + 16000 },
      }),
      /Only active dice player can place main bet|Turn deadline expired/,
    );
  });

  it('9b. stale timeout worker ignored via turnTimerId', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'stale-timer';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const stale = engine.getInternalState(sessionId)!.turnTimerId!;

    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: now + 16000 },
    });
    const after = engine.getInternalState(sessionId)!;
    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: now + 32000 },
    });
    assert.equal(result.events.length, 0);
    assert.notEqual(after.turnTimerId, stale);
  });

  it('10. multiple consecutive timeouts advance game', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'multi-timeout';
    loadBettingTable(engine, sessionId, 4, 0, 3);

    for (let i = 0; i < 3; i++) {
      const st = engine.getInternalState(sessionId)!;
      const timerId = st.turnTimerId!;
      const nowMs = Date.parse(st.turnDeadlineAt!) + 1;
      await engine.processAction({
        sessionId,
        userId: 'system',
        action: DICE_ACTIONS.TURN_TIMEOUT,
        payload: { turnTimerId: timerId, systemTimeout: true, nowMs },
      });
    }
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'BETTING');
    assert.ok(after.activeMatch);
  });

  it('15. timeout does not create settlement when no bet placed', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'no-settle';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const timerId = engine.getInternalState(sessionId)!.turnTimerId!;

    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: now + 16000 },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), false);
  });

  it('timeout with locked bet auto-rolls after final lock expires', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'auto-roll';
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    loadBettingTable(engine, sessionId, 2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', now + 1000);
    const st = engine.getInternalState(sessionId)!;
    st.mainBet!.locked = true;
    startFinalLockWindow(st, st.config.finalLockSeconds, now + 1000);
    engine.loadState(sessionId, st);

    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.PHASE_TIMEOUT,
      payload: { phaseTimerId: st.phaseTimerId!, systemTimeout: true, nowMs: now + 6000 },
    });
    assert.ok(result.events.some((e) => e.type === 'dice:result'));
  });

  it('11. 2-player table — timeout rotates holder to opponent', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'two-player-rotate';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const timerId = engine.getInternalState(sessionId)!.turnTimerId!;

    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: now + 16000 },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.activeMatch!.holderSeatIndex, 1);
  });

  it('FORCE_DICE still works before deadline', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'force-dice';
    const { now } = loadBettingTable(engine, sessionId, 2);
    await engine.processAction({
      sessionId,
      userId: 'admin',
      action: DICE_ACTIONS.FORCE_DICE,
      payload: { dice: [1, 1] },
    });
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', now + 1000);
    await lockMainBet(engine, sessionId, now + 1000);
    const roll = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: {},
    });
    assert.equal(roll.events.some((e) => e.type === 'dice:result'), true);
    const resultPayload = roll.events.find((e) => e.type === 'dice:result')!.payload.result as { outcome: string };
    assert.equal(resultPayload.outcome, 'WIN');
  });
});

describe('DiceGameEngine — table size timeout rotation', () => {
  it('12. 4-player anti-clockwise rotation on timeout', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'four-timeout';
    loadBettingTable(engine, sessionId, 4, 0, 3);
    const st = engine.getInternalState(sessionId)!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: {
        turnTimerId: st.turnTimerId!,
        systemTimeout: true,
        nowMs: Date.parse(st.turnDeadlineAt!) + 1,
      },
    });
    assert.equal(engine.getInternalState(sessionId)!.activeMatch!.holderSeatIndex, 3);
  });

  it('13. 6-player timeout keeps valid occupied seats', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'six-timeout';
    loadBettingTable(engine, sessionId, 6, 0, 5);
    const st = engine.getInternalState(sessionId)!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: {
        turnTimerId: st.turnTimerId!,
        systemTimeout: true,
        nowMs: Date.parse(st.turnDeadlineAt!) + 1,
      },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.seats.filter((s) => s.occupant).length, 6);
  });
});

describe('turn timer — expiry helper', () => {
  it('isTurnExpired respects deadline', () => {
    const engine = new DiceGameEngine();
    const sessionId = 'exp-helper';
    const { now } = loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(isTurnExpired(st, now + 14000), false);
    assert.equal(isTurnExpired(st, now + 16000), true);
  });
});
