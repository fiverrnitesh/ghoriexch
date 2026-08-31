import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DICE_ACTIONS, DEFAULT_DICE_CONFIG } from './dice.constants.js';
import {
  evaluateSideBet,
  sanitizePublicDiceState,
  seatTigerBot,
  assignRealPlayerSeat,
  createEmptySeats,
  buildInitialMatch,
  createInitialState,
  syncTableSeats,
  isFillerBot,
} from './dice.logic.js';
import { startTurnTimer } from './dice.turn-timer.js';
import { DiceGameEngine } from './dice.engine.js';
import { placeAndConfirmMainBet, closeBettingAndRoll } from './dice.test-helpers.js';

function buildOvalTable(realCount: number, sessionId = 'peer-test') {
  const engine = new DiceGameEngine();
  const state = createInitialState({ ...DEFAULT_DICE_CONFIG });
  state.seats = createEmptySeats(8);
  seatTigerBot(state);
  for (let i = 0; i < realCount; i++) {
    state.seats = assignRealPlayerSeat(state.seats, { type: 'USER', userId: `u${i}`, name: `P${i}` });
  }
  seatTigerBot(state);
  syncTableSeats(state);
  state.activeMatch = buildInitialMatch(state.seats, 'u0')!;
  state.acceptedParticipantIds = Array.from({ length: realCount }, (_, i) => `u${i}`);
  state.phase = 'BETTING';
  state.rollerSeatIndex = state.activeMatch.holderSeatIndex;
  startTurnTimer(state);
  engine.loadState(sessionId, state);
  return { engine, sessionId, state };
}

async function closeBetting(engine: DiceGameEngine, sessionId: string) {
  await closeBettingAndRoll(engine, sessionId);
}

describe('peer Haar/Zeet betting', () => {
  it('config uses unified 30s betting + 5s inter-round pause', () => {
    assert.equal(DEFAULT_DICE_CONFIG.turnTimeoutSeconds, 30);
    assert.equal(DEFAULT_DICE_CONFIG.sideBetWindowSeconds, 30);
    assert.equal(DEFAULT_DICE_CONFIG.interRoundPauseSeconds, 5);
  });

  it('Ex1 — Zeet accept, holder wins → backer wins', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        counterpartyUserId: 'u3',
        prediction: 'WIN',
        amount: 500,
        sideBetId: 'ex1',
      },
    });
    await engine.processAction({
      sessionId,
      userId: 'u3',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'ex1', amount: 500 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.counterpartyAcceptedAmount, 500);
    assert.equal(evaluateSideBet(sb, 'WIN', 500, 1.9), 'WON');
    assert.equal(evaluateSideBet(sb, 'LOSS', 500, 1.9), 'LOST');
  });

  it('Ex2 — reject → system accept, UI shows counterparty', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        counterpartyUserId: 'u3',
        prediction: 'LOSS',
        amount: 1000,
        sideBetId: 'ex2',
      },
    });
    await engine.processAction({
      sessionId,
      userId: 'u3',
      action: DICE_ACTIONS.REJECT_SIDE_BET,
      payload: { sideBetId: 'ex2' },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.systemLiability, 1000);
    assert.equal(sb.displayAcceptedByUserId, 'u3');
    const pub = sanitizePublicDiceState(engine.getInternalState(sessionId)!);
    const pubSb = pub.sideBets[0]!;
    assert.equal(pubSb.displayAcceptedByUserId, 'u3');
    assert.equal(pubSb.systemLiability, undefined);
    assert.equal(evaluateSideBet(sb, 'LOSS', 1000, 1.9), 'WON');
  });

  it('Ex3 — partial accept + hidden system fill', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        counterpartyUserId: 'u3',
        prediction: 'LOSS',
        amount: 500,
        sideBetId: 'ex3',
      },
    });
    await engine.processAction({
      sessionId,
      userId: 'u3',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'ex3', amount: 300, availableBalance: 300 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.counterpartyAcceptedAmount, 300);
    assert.equal(sb.systemLiability, 200);
    assert.equal(sb.displayAcceptedByUserId, 'u3');
    const pub = sanitizePublicDiceState(engine.getInternalState(sessionId)!);
    assert.equal(pub.sideBets[0]!.amount, 500);
    assert.equal(pub.sideBets[0]!.displayAcceptedByUserId, 'u3');
  });

  it('Ex4 — multiple independent peer bets same round', async () => {
    const { engine, sessionId } = buildOvalTable(5);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u3',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u4', prediction: 'WIN', amount: 200, sideBetId: 'ex4a' },
    });
    await engine.processAction({
      sessionId,
      userId: 'u3',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u2', prediction: 'LOSS', amount: 100, sideBetId: 'ex4b' },
    });
    const bets = engine.getInternalState(sessionId)!.sideBets;
    assert.equal(bets.length, 2);
    assert.equal(bets[0]!.prediction, 'WIN');
    assert.equal(bets[1]!.prediction, 'LOSS');
  });

  it('Ex6 — timer ends with zero peer bets still rolls when main bet placed', async () => {
    const { engine, sessionId } = buildOvalTable(3);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    engine.getInternalState(sessionId)!.forcedDice = [3, 3];
    await closeBetting(engine, sessionId);
    const after = engine.getInternalState(sessionId)!;
    assert.ok(['RESULT', 'INTER_ROUND_PAUSE', 'DICE_ROLLING', 'SETTLEMENT'].includes(after.phase)
      || after.dice !== null
      || after.phase === 'INTER_ROUND_PAUSE');
    assert.equal(after.sideBets.length, 0);
  });

  it('Ex7 — pending at T+30s → system accept by counterparty name', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        counterpartyUserId: 'u3',
        prediction: 'WIN',
        amount: 250,
        sideBetId: 'ex7',
      },
    });
    engine.getInternalState(sessionId)!.forcedDice = [4, 4];
    await closeBetting(engine, sessionId);
    const sb = engine.getInternalState(sessionId)!;
    // side bets cleared after settlement path — verify via expire before roll
    const { engine: e2, sessionId: s2 } = buildOvalTable(4);
    await placeAndConfirmMainBet(e2, s2, 'u0', 'player_tiger', 100);
    await e2.processAction({
      sessionId: s2,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u3', prediction: 'WIN', amount: 250, sideBetId: 'ex7b' },
    });
    e2.expirePendingSideBets(s2);
    const pending = e2.getInternalState(s2)!.sideBets[0]!;
    assert.equal(pending.status, 'ACCEPTED');
    assert.equal(pending.displayAcceptedByUserId, 'u3');
    assert.equal(pending.systemLiability, 250);
    void sb;
  });

  it('holder and opponent cannot request peer bets', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await assert.rejects(
      () => engine.processAction({
        sessionId,
        userId: 'u0',
        action: DICE_ACTIONS.REQUEST_SIDE_BET,
        payload: { counterpartyUserId: 'u2', prediction: 'WIN', amount: 50, sideBetId: 'block' },
      }),
      /cannot place Haar\/Zeet/,
    );
  });

  it('filler counterparty auto-accepts immediately with system liability', async () => {
    const { engine, sessionId, state } = buildOvalTable(2);
    const fillerSeat = state.seats.find((s) => isFillerBot(s.occupant));
    assert.ok(fillerSeat?.occupant?.type === 'BOT');
    const fillerId = `player_${fillerSeat.occupant.botId}`;
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    const { events } = await engine.processAction({
      sessionId,
      userId: 'u1',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: {
        counterpartyUserId: fillerId,
        prediction: 'WIN',
        amount: 250,
        sideBetId: 'filler-auto',
      },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.systemLiability, 250);
    assert.equal(sb.displayAcceptedByUserId, fillerId);
    assert.ok(events.some((e) => e.type === 'dice:side_bet_accepted'));
    const pub = sanitizePublicDiceState(engine.getInternalState(sessionId)!).sideBets[0]!;
    assert.equal(pub.displayAcceptedByUserId, fillerId);
    assert.equal(pub.systemLiability, undefined);
  });

  it('active players can accept peer bets', async () => {
    const { engine, sessionId } = buildOvalTable(4);
    await placeAndConfirmMainBet(engine, sessionId, 'u0', 'tiger', 100);
    await engine.processAction({
      sessionId,
      userId: 'u2',
      action: DICE_ACTIONS.REQUEST_SIDE_BET,
      payload: { counterpartyUserId: 'u0', prediction: 'WIN', amount: 50, sideBetId: 'holder-acc' },
    });
    await engine.processAction({
      sessionId,
      userId: 'u0',
      action: DICE_ACTIONS.ACCEPT_SIDE_BET,
      payload: { sideBetId: 'holder-acc', amount: 50 },
    });
    const sb = engine.getInternalState(sessionId)!.sideBets[0]!;
    assert.equal(sb.status, 'ACCEPTED');
    assert.equal(sb.counterpartyAcceptedAmount, 50);
  });
});
