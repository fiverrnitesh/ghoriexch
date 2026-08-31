import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiceGameEngine } from './dice.engine.js';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import { assignSeat, createEmptySeats } from './dice.logic.js';
import { startTurnTimer, isTurnExpired } from './dice.turn-timer.js';
import { startFinalLockWindow } from './dice.phase-timer.js';
import type { DiceGameState } from './dice.types.js';
import { lockMainBet, placeAndConfirmMainBet, advanceInterRoundPause, advanceDiceHandoff, advanceFinalLock } from './dice.test-helpers.js';

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
    interRoundPauseEndsAt: null,
    diceHandoffEndsAt: null,
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

function bettingDeadlinePlus(state: DiceGameState, ms = 1) {
  return Date.parse(state.turnDeadlineAt!) + ms;
}

describe('DiceGameEngine — turn timeout', () => {
  it('2. player acts before betting window ends — bet and roll succeed', async () => {
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

  it('4. timeout in BETTING auto-places main bet and opens FINAL_LOCK', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'auto-bet-lock';
    loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const timerId = st.turnTimerId!;
    const expiredAt = bettingDeadlinePlus(st);

    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: expiredAt },
    });

    assert.ok(result.events.some((e) => e.type === 'dice:main_bet_placed'));
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.equal(after.mainBet?.amount, after.config.minBet);
    assert.equal(after.mainBet?.choice, 'ODD');
    assert.equal(after.mainBet?.locked, true);
  });

  it('5. late PLACE_MAIN_BET rejected after deadline', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'late-bet';
    loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const late = bettingDeadlinePlus(st);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'EVEN', nowMs: late },
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
    loadBettingTable(engine, sessionId, 2);
    const st0 = engine.getInternalState(sessionId)!;
    const timerId = st0.turnTimerId!;
    const expiredAt = bettingDeadlinePlus(st0);

    const timeout = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: expiredAt },
    });
    assert.ok(timeout.events.length > 0);

    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'ODD', nowMs: expiredAt },
      }),
      /Only active dice player can place main bet|Turn deadline expired|Betting not open/,
    );
  });

  it('9b. stale timeout worker ignored via turnTimerId', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'stale-timer';
    loadBettingTable(engine, sessionId, 2);
    const st0 = engine.getInternalState(sessionId)!;
    const stale = st0.turnTimerId!;
    const expiredAt = bettingDeadlinePlus(st0);

    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: expiredAt },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.equal(after.turnTimerId, null);
    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: stale, systemTimeout: true, nowMs: expiredAt + 30_000 },
    });
    assert.equal(result.events.length, 0);
  });

  it('10. multiple consecutive betting timeouts advance through FINAL_LOCK', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'multi-timeout';
    loadBettingTable(engine, sessionId, 4, 0, 3);
    const forceWin = () => {
      const st = engine.getInternalState(sessionId)!;
      st.forcedDice = [3, 3];
      engine.loadState(sessionId, st);
    };

    for (let i = 0; i < 3; i++) {
      const st = engine.getInternalState(sessionId)!;
      if (st.phase === 'INTER_ROUND_PAUSE') {
        await advanceInterRoundPause(engine, sessionId);
      }
      if (st.phase === 'DICE_HANDOFF') await advanceDiceHandoff(engine, sessionId);
      if (st.phase === 'FINAL_LOCK') {
        forceWin();
        await advanceFinalLock(engine, sessionId);
        if (engine.getInternalState(sessionId)!.phase === 'INTER_ROUND_PAUSE') {
          await advanceInterRoundPause(engine, sessionId);
        }
      }
      const current = engine.getInternalState(sessionId)!;
      const timerId = current.turnTimerId!;
      const nowMs = Date.parse(current.turnDeadlineAt!) + 1;
      await engine.processAction({
        sessionId,
        userId: 'system',
        action: DICE_ACTIONS.TURN_TIMEOUT,
        payload: { turnTimerId: timerId, systemTimeout: true, nowMs },
      });
      forceWin();
      await advanceFinalLock(engine, sessionId);
      if (engine.getInternalState(sessionId)!.phase === 'INTER_ROUND_PAUSE') {
        await advanceInterRoundPause(engine, sessionId);
      }
    }
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'BETTING');
    assert.ok(after.activeMatch);
  });

  it('15. timeout auto-bet opens FINAL_LOCK without settlement yet', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'no-settle';
    loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const timerId = st.turnTimerId!;

    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: bettingDeadlinePlus(st) },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:settlement'), false);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'DICE_HANDOFF');
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

  it('11. 2-player table — timeout opens FINAL_LOCK for auto roll', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'two-player-rotate';
    loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const timerId = st.turnTimerId!;

    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: bettingDeadlinePlus(st) },
    });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.ok(after.mainBet?.locked);
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
  it('12. 4-player timeout opens FINAL_LOCK for auto roll', async () => {
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
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.phase, 'DICE_HANDOFF');
    assert.ok(after.mainBet?.locked);
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
    loadBettingTable(engine, sessionId, 2);
    const st = engine.getInternalState(sessionId)!;
    const deadline = Date.parse(st.turnDeadlineAt!);
    assert.equal(isTurnExpired(st, deadline - 1), false);
    assert.equal(isTurnExpired(st, deadline), true);
  });
});
