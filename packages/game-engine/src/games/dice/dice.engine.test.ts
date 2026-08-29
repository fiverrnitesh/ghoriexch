import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiceGameEngine } from './dice.engine.js';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import { assignSeat, createEmptySeats, evaluateSideBet } from './dice.logic.js';
import { startTurnTimer } from './dice.turn-timer.js';
import type { DiceGameState } from './dice.types.js';
import { buildTable, lockMainBet, openSideBetting, placeAndConfirmMainBet, DEFAULT_TEST_STATE_FIELDS } from './dice.test-helpers.js';

describe('DiceGameEngine — side bets', () => {
  it('spectator can request side bet during betting window', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    const result = await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        targetUserId: 'u0',
        prediction: 'WIN',
        amount: 50,
        sideBetId: 'sb_test_1',
      },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:side_bet_request'), true);
    const state = engine.getInternalState(sessionId)!;
    assert.equal(state.sideBets.length, 1);
    assert.equal(state.sideBets[0]!.status, 'PENDING');
  });

  it('active player can accept side bet', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'LOSS', amount: 25, sideBetId: 'sb_test_2' },
    });
    openSideBetting(engine, sessionId);
    const result = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'sb_test_2' },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:side_bet_accepted'), true);
    assert.equal(engine.getInternalState(sessionId)!.sideBets[0]!.status, 'ACCEPTED');
  });

  it('active player reject assigns remainder to TIGER', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 25, sideBetId: 'sb_test_3' },
    });
    openSideBetting(engine, sessionId);
    const result = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.REJECT_SIDE_BET,
      payload: { sideBetId: 'sb_test_3' },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:side_bet_accepted'), true);
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.tigerLiability, 25);
    assert.equal(sb.playerAcceptedAmount, 0);
  });

  it('spectator can request side bet during SIDE_BETTING', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    openSideBetting(engine, sessionId);
    const result = await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 40, sideBetId: 'sb_side_window' },
    });
    assert.equal(result.events.some((e) => e.type === 'dice:side_bet_request'), true);
    assert.equal(engine.getInternalState(sessionId)!.sideBets.at(-1)?.status, 'PENDING');
  });

  it('rejects side bet after betting window closes', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    const state = engine.getInternalState(sessionId)!;
    state.turnDeadlineAt = new Date(Date.now() - 1000).toISOString();
    engine.loadState(sessionId, state);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u0', prediction: 'WIN', amount: 10, sideBetId: 'sb_late' },
      }),
      /window closed/,
    );
  });
});

describe('DiceGameEngine — bot participation', () => {
  it('TIGER bot can place bet and roll dice', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'bot-session';
    let seats = createEmptySeats(6);
    seats = assignSeat(seats, { type: 'BOT', botId: 'tiger', name: 'TIGER' });
    seats = assignSeat(seats, { type: 'USER', userId: 'u0', name: 'P0' });
    const state: DiceGameState = {
      phase: 'BETTING',
      seats,
      maxSeats: 6,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
      sideBetWindowEndsAt: null,
      mainBet: null,
      dice: null,
      roundNumber: 1,
      roundId: 'round-bot',
      config: { ...DEFAULT_DICE_CONFIG },
      sideBets: [],
      lastWinnerSeatIndex: null,
      forcedDice: null,
      turnStartedAt: null,
      turnDeadlineAt: null,
      turnTimerId: null,
      ...DEFAULT_TEST_STATE_FIELDS,
      acceptedParticipantIds: ['u0'],
    };
    startTurnTimer(state);
    engine.loadState(sessionId, state);

    await engine.processAction({
      sessionId,
      userId: 'tiger',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 10, choice: 'ODD' },
    });
    await lockMainBet(engine, sessionId);

    await engine.processAction({
      sessionId,
      userId: 'tiger',
      action: DICE_ACTIONS.FORCE_DICE,
      payload: { dice: [1, 1] },
    });

    const result = await engine.processAction({
      sessionId,
      userId: 'tiger',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: { botAction: true },
    });

    assert.equal(result.events.some((e) => e.type === 'dice:result'), true);
    assert.equal(engine.getInternalState(sessionId)!.phase, 'BETTING');
  });
});

describe('DiceGameEngine — side bet expiry', () => {
  it('assigns pending side bets to TIGER when window ends', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 10, sideBetId: 'sb_expire_1' },
    });
    const events = engine.expirePendingSideBets(sessionId);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, 'dice:side_bet_accepted');
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.tigerLiability, 10);
  });
});

describe('side bet settlement evaluation', () => {
  it('WIN prediction wins when target wins main bet', () => {
    const status = evaluateSideBet(
      { id: '1', backerUserId: 'b', targetUserId: 't', prediction: 'WIN', amount: 100, status: 'ACCEPTED', expiresAt: new Date().toISOString() },
      'WIN',
      100,
      1.9,
    );
    assert.equal(status, 'WON');
  });

  it('LOSS prediction wins when target loses main bet', () => {
    const status = evaluateSideBet(
      { id: '1', backerUserId: 'b', targetUserId: 't', prediction: 'LOSS', amount: 100, status: 'ACCEPTED', expiresAt: new Date().toISOString() },
      'LOSS',
      100,
      1.9,
    );
    assert.equal(status, 'WON');
  });
});

describe('settlement idempotency helper', () => {
  it('prevents duplicate round settlement keys', async () => {
    const { claimRoundSettlement, resetRoundSettlements } = await import('./dice.settlement.js');
    resetRoundSettlements();
    assert.equal(claimRoundSettlement('round-a'), true);
    assert.equal(claimRoundSettlement('round-a'), false);
  });
});

describe('DiceGameEngine — duplicate actions', () => {
  it('TEST 8: rejects duplicate ROLL_DICE in same round', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD' },
    });
    await lockMainBet(engine, sessionId);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.FORCE_DICE,
      payload: { dice: [1, 1] },
    });
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: {},
    });
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Dice roll not available|Bet not locked|Main bet required/,
    );
  });

  it('main bet records equal matched opponent stake', async () => {
    const { engine, sessionId } = buildTable(2);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u1', 100, 'ODD');
    const mainBet = engine.getInternalState(sessionId)!.mainBet!;
    assert.equal(mainBet.amount, 100);
    assert.equal(mainBet.opponentStake, 100);
    assert.equal(mainBet.matchedPool, 200);
    assert.equal(mainBet.opponentBotId, 'tiger');
    assert.equal(mainBet.locked, true);
  });
});

describe('DiceGameEngine — authorization', () => {
  it('rejects opponent placing main bet', async () => {
    const { engine, sessionId } = buildTable(2);
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

  it('rejects spectator placing main bet', async () => {
    const { engine, sessionId } = buildTable(3);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u2',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'EVEN' },
      }),
      /Only active dice player/,
    );
  });

  it('rejects roll before main bet is locked', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD' },
    });
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Dice roll not available|not locked/,
    );
  });

  it('rejects opponent rolling dice', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD' },
    });
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

  it('rejects duplicate main bet in same round', async () => {
    const { engine, sessionId } = buildTable(2);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD' },
    });
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.PLACE_MAIN_BET,
        payload: { amount: 100, choice: 'EVEN' },
      }),
      /Betting not open|already placed/,
    );
  });

  it('rejects roll without main bet', async () => {
    const { engine, sessionId } = buildTable(2);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.ROLL_DICE,
        payload: {},
      }),
      /Main bet required|Bet not locked|Dice roll not available/,
    );
  });

  it('rejects side bet on inactive player', async () => {
    const { engine, sessionId } = buildTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u3', 100);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u2',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u1', prediction: 'WIN', amount: 50, sideBetId: 'sb_bad_target' },
      }),
      /active player/,
    );
  });

  it('rejects duplicate side bet id', async () => {
    const { engine, sessionId } = buildTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u2', 100);
    await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { targetUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'sb_dup' },
    });
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u1',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { targetUserId: 'u0', prediction: 'LOSS', amount: 25, sideBetId: 'sb_dup' },
      }),
      /Duplicate side bet/,
    );
  });
});

describe('DiceGameEngine — multi-round stability', () => {
  async function playRound(
    engine: DiceGameEngine,
    sessionId: string,
    holderId: string,
    dice: [number | 'BLANK', number | 'BLANK'],
    choice: 'ODD' | 'EVEN' = 'ODD',
    nowMs?: number,
  ) {
    const st = engine.getInternalState(sessionId)!;
    const oppSeat = st.seats.find((s) => s.seatIndex === st.activeMatch!.opponentSeatIndex);
    const oppId = oppSeat?.occupant?.type === 'USER'
      ? oppSeat.occupant.userId!
      : oppSeat?.occupant?.botId ?? 'tiger';

    await placeAndConfirmMainBet(engine, sessionId, holderId, oppId, 100, choice, nowMs);
    await lockMainBet(engine, sessionId, nowMs);
    await engine.processAction({
      sessionId,
      userId: holderId,
      action: DICE_ACTIONS.FORCE_DICE,
      payload: { dice },
    });
    return engine.processAction({
      sessionId,
      userId: holderId,
      action: DICE_ACTIONS.ROLL_DICE,
      payload: holderId === 'tiger' ? { botAction: true } : {},
    });
  }

  it('2-player table completes 5 consecutive rounds without getting stuck', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'two-player-marathon';
    let seats = createEmptySeats(6);
    seats = assignSeat(seats, { type: 'USER', userId: 'u0', name: 'Player One' });
    seats = assignSeat(seats, { type: 'BOT', botId: 'tiger', name: 'TIGER' });
    const marathonState: DiceGameState = {
      phase: 'BETTING',
      seats,
      maxSeats: 6,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 1 },
      sideBetWindowEndsAt: null,
      mainBet: null,
      dice: null,
      roundNumber: 1,
      roundId: 'r-two-1',
      config: { ...DEFAULT_DICE_CONFIG },
      sideBets: [],
      lastWinnerSeatIndex: null,
      forcedDice: null,
      turnStartedAt: null,
      turnDeadlineAt: null,
      turnTimerId: null,
      ...DEFAULT_TEST_STATE_FIELDS,
      acceptedParticipantIds: ['u0'],
    };
    startTurnTimer(marathonState);
    engine.loadState(sessionId, marathonState);

    const diceSequence: Array<[1 | 3 | 4 | 6, 1 | 3 | 4 | 6]> = [
      [1, 1], [4, 4], [3, 3], [6, 6], [1, 1],
    ];

    for (let i = 0; i < 5; i++) {
      const stateBefore = engine.getInternalState(sessionId)!;
      const holderSeat = stateBefore.activeMatch!.holderSeatIndex;
      const holderId = holderSeat === 0 ? 'u0' : 'tiger';
      const result = await playRound(engine, sessionId, holderId, diceSequence[i]!);
      assert.equal(result.events.some((e) => e.type === 'dice:settlement'), true);
      const stateAfter = engine.getInternalState(sessionId)!;
      assert.equal(stateAfter.phase, 'BETTING');
      assert.equal(stateAfter.mainBet, null);
      assert.ok(stateAfter.activeMatch);
    }
    assert.equal(engine.getInternalState(sessionId)!.roundNumber, 6);
  });

  it('4-player rotation uses anti-clockwise opponent replacement across rounds', async () => {
    const engine = new DiceGameEngine();
    const sessionId = 'four-player-rotation';
    let seats = createEmptySeats(6);
    for (let i = 0; i < 4; i++) {
      seats = assignSeat(seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
    }
    const fourState: DiceGameState = {
      phase: 'BETTING',
      seats,
      maxSeats: 6,
      activeMatch: { holderSeatIndex: 0, opponentSeatIndex: 3 },
      sideBetWindowEndsAt: null,
      mainBet: null,
      dice: null,
      roundNumber: 1,
      roundId: 'r-four-1',
      config: { ...DEFAULT_DICE_CONFIG },
      sideBets: [],
      lastWinnerSeatIndex: null,
      forcedDice: null,
      turnStartedAt: null,
      turnDeadlineAt: null,
      turnTimerId: null,
      ...DEFAULT_TEST_STATE_FIELDS,
      acceptedParticipantIds: ['u0', 'u1', 'u2', 'u3'],
    };
    startTurnTimer(fourState);
    engine.loadState(sessionId, fourState);

    await playRound(engine, sessionId, 'u0', [1, 1]);
    assert.deepEqual(engine.getInternalState(sessionId)!.activeMatch, { holderSeatIndex: 0, opponentSeatIndex: 2 });

    await playRound(engine, sessionId, 'u0', [4, 4]);
    assert.deepEqual(engine.getInternalState(sessionId)!.activeMatch, { holderSeatIndex: 2, opponentSeatIndex: 1 });

    await playRound(engine, sessionId, 'u2', [4, 4], 'EVEN');
    assert.deepEqual(engine.getInternalState(sessionId)!.activeMatch, { holderSeatIndex: 2, opponentSeatIndex: 0 });
  });

  it('settlement event captures completed match before rotation', async () => {
    const { engine, sessionId } = buildTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'u3', 100, 'ODD');
    await lockMainBet(engine, sessionId);
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.FORCE_DICE,
      payload: { dice: [1, 1] },
    });
    const result = await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ROLL_DICE,
      payload: {},
    });
    const settlement = result.events.find((e) => e.type === 'dice:settlement');
    assert.ok(settlement);
    assert.deepEqual(settlement!.payload.completedMatch, { holderSeatIndex: 0, opponentSeatIndex: 3 });
    assert.equal(settlement!.payload.roundNumber, 1);
    const settlementResult = settlement!.payload.result as { matchedPool: number; adminFee: number; winnerPayout: number };
    assert.equal(settlementResult.matchedPool, 200);
    assert.equal(settlementResult.adminFee, 20);
    assert.equal(settlementResult.winnerPayout, 180);
    assert.equal(engine.getInternalState(sessionId)!.activeMatch!.opponentSeatIndex, 2);
  });
});

describe('DiceGameEngine — table capacity', () => {
  it('rejects join when table is full (6 real users + TIGER)', async () => {
    const engine = new DiceGameEngine();
    const { sessionId } = await engine.createSession({
      hostUserId: 'host',
      config: DEFAULT_DICE_CONFIG as unknown as Record<string, unknown>,
    });
    for (let i = 0; i < 8; i++) {
      await engine.joinSession({ sessionId, userId: `u${i}` });
    }
    const state = engine.getInternalState(sessionId)!;
    assert.equal(state.seats.filter((s) => s.occupant?.type === 'USER').length, 8);
    assert.equal(state.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
    await assert.rejects(
      () => engine.joinSession({ sessionId, userId: 'u8' }),
      /Table full/,
    );
  });

  it('TIGER does not consume a real-player seat', async () => {
    const engine = new DiceGameEngine();
    const { sessionId } = await engine.createSession({
      hostUserId: 'host',
      config: DEFAULT_DICE_CONFIG as unknown as Record<string, unknown>,
    });
    const empty = engine.getInternalState(sessionId)!;
    assert.equal(empty.maxSeats, 9);
    assert.equal(empty.seats.filter((s) => s.occupant?.type === 'USER').length, 0);
    assert.equal(empty.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
    await engine.joinSession({ sessionId, userId: 'u0' });
    const after = engine.getInternalState(sessionId)!;
    assert.equal(after.seats.filter((s) => s.occupant?.type === 'USER').length, 1);
    assert.equal(after.seats.some((s) => s.occupant?.type === 'BOT' && s.occupant.botId === 'tiger'), true);
  });
});
