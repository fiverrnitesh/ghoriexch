import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTurnTimer,
  clearTurnTimer,
  isTurnExpired,
  getTurnRemainingMs,
  shouldMonitorTurnTimer,
  generateTurnTimerId,
} from './dice.turn-timer.js';
import { createInitialState } from './dice.logic.js';
import { DEFAULT_DICE_CONFIG } from './dice.constants.js';
import type { DiceGameState } from './dice.types.js';

function activeBettingState(nowMs: number): DiceGameState {
  const state = createInitialState({ ...DEFAULT_DICE_CONFIG, turnTimeoutSeconds: 15 });
  state.phase = 'BETTING';
  state.activeMatch = { holderSeatIndex: 0, opponentSeatIndex: 1 };
  state.roundId = 'round-1';
  startTurnTimer(state, nowMs);
  return state;
}

describe('turn timer — start and deadline', () => {
  it('1. turn starts → deadline created', () => {
    const now = Date.parse('2026-08-16T21:00:00.000Z');
    const state = activeBettingState(now);
    assert.ok(state.turnStartedAt);
    assert.ok(state.turnDeadlineAt);
    assert.ok(state.turnTimerId);
    assert.equal(state.turnStartedAt, '2026-08-16T21:00:00.000Z');
    assert.equal(state.turnDeadlineAt, '2026-08-16T21:00:15.000Z');
    assert.equal(getTurnRemainingMs(state, now), 15000);
  });

  it('generateTurnTimerId is unique per start', () => {
    const state = activeBettingState(Date.now());
    const a = state.turnTimerId;
    startTurnTimer(state, Date.now() + 1);
    assert.notEqual(state.turnTimerId, a);
  });
});

describe('turn timer — expiry', () => {
  it('3. timeout after 15 seconds', () => {
    const now = 1_000_000;
    const state = activeBettingState(now);
    assert.equal(isTurnExpired(state, now + 14999), false);
    assert.equal(isTurnExpired(state, now + 15000), true);
  });

  it('7. refresh preserves deadline (remaining from server time)', () => {
    const now = 2_000_000;
    const state = activeBettingState(now);
    const afterRefresh = now + 5_000;
    assert.equal(getTurnRemainingMs(state, afterRefresh), 10_000);
    assert.equal(isTurnExpired(state, afterRefresh), false);
  });
});

describe('turn timer — monitoring', () => {
  it('monitors BETTING for the full window including after main bet', () => {
    const state = activeBettingState(Date.now());
    assert.equal(shouldMonitorTurnTimer(state), true);
    state.mainBet = { userId: 'u0', amount: 100, choice: 'ODD', locked: false };
    assert.equal(shouldMonitorTurnTimer(state), true);
    state.phase = 'SIDE_BETTING';
    assert.equal(shouldMonitorTurnTimer(state), false);
    clearTurnTimer(state);
    assert.equal(state.turnTimerId, null);
  });
});

describe('turn timer — id generation', () => {
  it('8. timer id includes round and holder context', () => {
    const state = activeBettingState(1000);
    assert.match(state.turnTimerId!, /^tt_round-1_0_/);
    assert.equal(generateTurnTimerId(state, 1000).startsWith('tt_round-1_0_'), true);
  });
});
