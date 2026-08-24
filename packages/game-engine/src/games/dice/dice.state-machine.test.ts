/**
 * State-machine coverage for room admission, opponent match, side bets, final lock, and TIGER.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import { DiceGameEngine } from './dice.engine.js';
import {
  getActiveHolderActorId,
  getActiveOpponentActorId,
  sanitizePublicDiceState,
} from './dice.logic.js';
import {
  buildTable,
  lockMainBet,
  placeAndConfirmMainBet,
} from './dice.test-helpers.js';

describe('Dice state machine — rooms and host', () => {
  it('host is initial dice holder on round 1', () => {
    const { engine, sessionId } = buildTable(3, 'host-holder', { hostUserId: 'u1' });
    const st = engine.getInternalState(sessionId)!;
    const holderId = getActiveHolderActorId(st);
    assert.equal(holderId, 'u1');
    assert.equal(st.roomHostUserId, 'u1');
  });

  it('friends mode still seats TIGER', async () => {
    const engine = new DiceGameEngine();
    const { sessionId } = await engine.createSession({
      hostUserId: 'u0',
      config: { ...DEFAULT_DICE_CONFIG, gameMode: 'FRIENDS' } as unknown as Record<string, unknown>,
    });
    engine.configureSessionContext(sessionId, { gameMode: 'FRIENDS', acceptedParticipantIds: ['u0'], roomHostUserId: 'u0' });
    await engine.joinSession({ sessionId, userId: 'u0' });
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
  });

  it('rejected participant cannot place main bet', async () => {
    const { engine, sessionId } = buildTable(2, 'reject-main', { gameMode: 'FRIENDS' });
    const st = engine.getInternalState(sessionId)!;
    st.acceptedParticipantIds = ['u0'];
    engine.loadState(sessionId, st);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'ODD' },
      }),
      /Only active dice player/,
    );
  });

  it('public state hides bot metadata', () => {
    const { engine, sessionId } = buildTable(1, 'sanitize-bot');
    const st = engine.getInternalState(sessionId)!;
    st.seats[1]!.occupant = { type: 'BOT', botId: 'tiger', name: 'TIGER' };
    engine.loadState(sessionId, st);
    const pub = sanitizePublicDiceState(engine.getInternalState(sessionId)!);
    const botSeat = pub.seats.find((s) => s.occupant?.type === 'BOT');
    assert.equal(botSeat, undefined);
  });
});

describe('Dice state machine — main bet (15s)', () => {
  it('holder bet stays in BETTING and TIGER auto-matches', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'EVEN' },
    });
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.phase, 'BETTING');
    assert.equal(st.mainBet!.choice, 'EVEN');
    assert.equal(st.mainBet!.opponentStake, 100);
    assert.equal(st.mainBet!.opponentBotId, 'tiger');
    assert.ok(st.turnDeadlineAt);
  });

  it('omitted choice defaults to EVEN', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100 },
    });
    assert.equal(engine.getInternalState(sessionId)!.mainBet!.choice, 'EVEN');
  });

  it('successful main bet records matched pool', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(st.phase, 'BETTING');
    assert.equal(st.mainBet!.matchedPool, 200);
  });
});

describe('Dice state machine — backing bets (15s) and acceptance (10s)', () => {
  it('side bet only during BETTING after main bet', async () => {
    const { engine, sessionId } = buildTable(3);
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'sb_early', nowMs: now },
      }),
      /Main bet required|Side betting not open/,
    );
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD', nowMs: now },
    });
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'sb_ok', nowMs: now },
    });
    assert.equal(engine.getInternalState(sessionId)!.sideBets[0]!.status, 'PENDING');
  });

  it('target must be active match player', async () => {
    const { engine, sessionId } = buildTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u3', 100);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u1', prediction: 'WIN', amount: 50, sideBetId: 'sb_bad_target' },
      }),
      /active player/,
    );
  });

  it('pending side bets assigned to TIGER when acceptance window closes', async () => {
    const { engine, sessionId } = buildTable(3);
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100, 'ODD', now);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 25, sideBetId: 'sb_pending', nowMs: now },
    });
    const st = engine.getInternalState(sessionId)!;
    const timerId = st.turnTimerId!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.TURN_TIMEOUT,
      payload: { turnTimerId: timerId, systemTimeout: true, nowMs: Date.parse(st.turnDeadlineAt!) + 1 },
    });
    const afterBet = engine.getInternalState(sessionId)!;
    assert.equal(afterBet.phase, 'SIDE_BETTING');
    const acceptTimer = afterBet.phaseTimerId!;
    await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.PHASE_TIMEOUT,
      payload: { phaseTimerId: acceptTimer, systemTimeout: true, nowMs: Date.parse(afterBet.sideBetWindowEndsAt!) + 1 },
    });
    assert.equal(engine.getInternalState(sessionId)!.phase, 'FINAL_LOCK');
    assert.equal(engine.getInternalState(sessionId)!.sideBets[0]!.status, 'ACCEPTED');
    assert.equal(engine.getInternalState(sessionId)!.sideBets[0]!.tigerLiability, 25);
  });
});

describe('Dice state machine — roll ready (5s)', () => {
  it('rejects side bet actions during final lock', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await lockMainBet(engine, sessionId);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u0', prediction: 'WIN', amount: 10, sideBetId: 'sb_lock' },
      }),
      /Side betting not open/,
    );
  });

  it('auto-rolls after final lock timeout', async () => {
    const { engine, sessionId } = buildTable(2);
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD', now);
    await lockMainBet(engine, sessionId, now);
    const st = engine.getInternalState(sessionId)!;
    const result = await engine.processAction({
      sessionId,
      userId: 'system',
      action: DICE_ACTIONS.PHASE_TIMEOUT,
      payload: { phaseTimerId: st.phaseTimerId!, systemTimeout: true, nowMs: now + 6000 },
    });
    assert.ok(result.events.some((e) => e.type === 'dice:result'));
  });
});

describe('Dice state machine — TIGER', () => {
  it('TIGER auto-matches the main bet immediately', async () => {
    const { engine, sessionId, state } = buildTable(1, 'tiger-auto');
    state.seats[1]!.occupant = { type: 'BOT', botId: 'tiger', name: 'TIGER' };
    state.activeMatch = { holderSeatIndex: 0, opponentSeatIndex: 1 };
    engine.loadState(sessionId, state);
    const now = Date.parse('2026-08-16T12:00:00.000Z');
    const result = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD', nowMs: now },
    });
    assert.ok(result.events.some((e) => e.type === 'dice:main_match_confirmed'));
    assert.equal(engine.getInternalState(sessionId)!.mainBet!.opponentBotId, 'tiger');
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });

  it('human opponent id takes priority over bot seat', () => {
    const { engine, sessionId } = buildTable(2);
    const st = engine.getInternalState(sessionId)!;
    assert.equal(getActiveOpponentActorId(st), 'u1');
  });
});
