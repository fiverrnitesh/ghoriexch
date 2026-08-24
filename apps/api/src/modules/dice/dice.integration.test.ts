/**
 * Live PostgreSQL integration tests for dice settlement economics.
 * Skips when DATABASE_URL is unavailable.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  DICE_ACTIONS,
  resetRoundSettlements,
  getTurnRemainingMs,
  getActiveOpponentActorId,
  getActivePhaseDeadline,
  startTurnTimer,
  startFinalLockWindow,
  type DiceGameState,
  type DiceRoundResult,
} from '@games/game-engine';
import { registerGamePlugins } from '../../games/register-games.js';
import { connectDatabase, disconnectDatabase, prisma } from '../../database/client.js';
import { sessionService } from '../sessions/session.service.js';
import { roomService } from '../rooms/room.service.js';
import { diceService } from './dice.service.js';
import { diceGameEngine, gameRegistry } from '@games/game-engine';
import { parseAmount } from '../../lib/utils.js';
import { handleTurnTimeout, resetTurnTimerSchedulerForTests, setDiceTimersEnabled, shutdownDiceSchedulersForTests } from './dice-turn-timer.scheduler.js';
import { clearPhaseTimerSchedule, resetPhaseTimerSchedulerForTests } from './dice-phase-timer.scheduler.js';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const canRun = !!process.env.DATABASE_URL;

async function getUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { wallet: true } });
  if (!user?.wallet) throw new Error(`User ${email} not found — run npm run db:seed`);
  return user;
}

async function setBalance(userId: string, amount: number) {
  await prisma.wallet.update({
    where: { userId },
    data: { balance: amount, availableBalance: amount, lockedBalance: 0 },
  });
}

async function getAvailableBalance(userId: string): Promise<number> {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return parseAmount(w.availableBalance.toString());
}

async function createDiceRoom(hostUserId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { slug: 'dice' } });
  return roomService.create({
    gameId: game.id,
    hostUserId,
    name: 'Integration Test Room',
    gameMode: 'ONLINE',
    maxPlayers: game.maxPlayers,
    isSystemRoom: true,
  });
}

async function setupSession(hostId: string, opponentId?: string) {
  const room = await createDiceRoom(hostId);
  const session = await sessionService.createSession('dice', hostId, room.id);
  await sessionService.joinSession(session.id, hostId);
  if (opponentId) {
    await sessionService.joinSession(session.id, opponentId);
  }
  return session;
}

async function setupHumanVsHumanSession(playerAId: string, playerBId: string) {
  const session = await setupSession(playerAId, playerBId);
  const state = await loadSessionState(session.id);
  state.seats = state.seats.map((s) =>
    s.occupant?.type === 'BOT' ? { ...s, occupant: null } : { ...s, occupant: s.occupant ? { ...s.occupant } : null },
  );
  const seatA = state.seats.find((s) => s.occupant?.userId === playerAId)!.seatIndex;
  const seatB = state.seats.find((s) => s.occupant?.userId === playerBId)!.seatIndex;
  state.activeMatch = { holderSeatIndex: seatA, opponentSeatIndex: seatB };
  state.phase = 'BETTING';
  state.mainBet = null;
  state.roomHostUserId = playerAId;
  state.gameMode = 'ONLINE';
  state.acceptedParticipantIds = [playerAId, playerBId];
  state.roundId = state.roundId || `it_${Date.now()}`;
  startTurnTimer(state);
  diceGameEngine.loadState(session.id, state);
  await prisma.gameSession.update({ where: { id: session.id }, data: { state: state as object } });
  return session;
}

async function loadSessionState(sessionId: string) {
  const row = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  diceGameEngine.loadState(sessionId, row.state as unknown as DiceGameState);
  return diceGameEngine.getInternalState(sessionId)!;
}

function getHolderActorId(state: DiceGameState): string {
  const seat = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex);
  if (!seat?.occupant) throw new Error('No holder seated');
  return seat.occupant.type === 'USER' ? seat.occupant.userId! : seat.occupant.botId!;
}

async function persistEngineAction(
  sessionId: string,
  input: { userId: string; action: string; payload: Record<string, unknown> },
) {
  const session = await prisma.gameSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { game: true },
  });
  await loadSessionState(sessionId);
  const result = await diceGameEngine.processAction({ sessionId, ...input });
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { state: result.state as object },
  });
  await diceService.handleEngineEvents(session, result.events as never[], input);
  return result;
}

async function advancePhaseTimeout(sessionId: string) {
  const state = await loadSessionState(sessionId);
  const deadline = getActivePhaseDeadline(state);
  if (!state.phaseTimerId || !deadline) return null;
  return persistEngineAction(sessionId, {
    userId: 'system',
    action: DICE_ACTIONS.PHASE_TIMEOUT,
    payload: {
      phaseTimerId: state.phaseTimerId,
      systemTimeout: true,
      nowMs: Date.parse(deadline) + 1,
    },
  });
}

async function playRound(
  sessionId: string,
  dice: [1 | 3 | 4 | 6 | 'BLANK', 1 | 3 | 4 | 6 | 'BLANK'],
  choice: 'ODD' | 'EVEN' = 'ODD',
  amount = 100,
) {
  resetTurnTimerSchedulerForTests();
  clearPhaseTimerSchedule(sessionId);

  let state = await loadSessionState(sessionId);
  const holderUserId = getHolderActorId(state);
  const isBotHolder = state.seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex)?.occupant?.type === 'BOT';
  const betKey = `it-bet-${Date.now()}-${Math.random()}`;

  await persistEngineAction(sessionId, {
    userId: holderUserId,
    action: DICE_ACTIONS.PLACE_MAIN_BET,
    payload: { amount, choice, idempotencyKey: betKey, botAction: isBotHolder || undefined },
  });

  state = await loadSessionState(sessionId);
  if (state.mainBet && !state.mainBet.locked) {
    state.mainBet.locked = true;
    state.mainBet.holderLocked = true;
    diceGameEngine.loadState(sessionId, state);
    await prisma.gameSession.update({ where: { id: sessionId }, data: { state: state as object } });
  }

  startFinalLockWindow(state, state.config.finalLockSeconds, Date.now());
  diceGameEngine.loadState(sessionId, state);
  await prisma.gameSession.update({ where: { id: sessionId }, data: { state: state as object } });

  await persistEngineAction(sessionId, {
    userId: holderUserId,
    action: DICE_ACTIONS.FORCE_DICE,
    payload: { dice },
  });

  state = await loadSessionState(sessionId);
  const rollResult = await persistEngineAction(sessionId, {
    userId: holderUserId,
    action: DICE_ACTIONS.ROLL_DICE,
    payload: { idempotencyKey: `it-roll-${Date.now()}`, botAction: isBotHolder || undefined },
  });
  return { rollResult, holderUserId };
}

describe('Dice Postgres integration', { skip: !canRun ? 'DATABASE_URL not set' : false }, () => {
  before(async () => {
    setDiceTimersEnabled(true);
    registerGamePlugins();
    await connectDatabase();
    resetRoundSettlements();
    resetTurnTimerSchedulerForTests();
    resetPhaseTimerSchedulerForTests();
  });

  after(async () => {
    await shutdownDiceSchedulersForTests();
    await disconnectDatabase();
  });

  it('full flow: session → matched debits → roll → settlement → admin fee → diceRound', async () => {
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('rahul@games.local');
    const admin = await getUser('admin@games.local');

    await setBalance(playerA.id, 1000);
    await setBalance(playerB.id, 1000);
    const adminBefore = await getAvailableBalance(admin.id);

    const session = await setupHumanVsHumanSession(playerA.id, playerB.id);

    const balanceABefore = await getAvailableBalance(playerA.id);
    const balanceBBefore = await getAvailableBalance(playerB.id);

    const { rollResult } = await playRound(session.id, [1, 1], 'ODD', 100);

    const settlementEvent = rollResult?.events.find((e) => e.type === 'dice:settlement');
    assert.ok(settlementEvent);
    const result = settlementEvent!.payload.result as DiceRoundResult;
    assert.equal(result.matchedPool, 200);
    assert.equal(result.adminFee, 20);
    assert.equal(result.winnerPayout, 180);
    assert.equal(result.holderNet, 80);

    const balanceAAfter = await getAvailableBalance(playerA.id);
    const balanceBAfter = await getAvailableBalance(playerB.id);
    const adminAfter = await getAvailableBalance(admin.id);

    assert.equal(balanceAAfter, balanceABefore - 100 + 180);
    assert.equal(balanceBAfter, balanceBBefore);
    assert.equal(adminAfter, adminBefore + 20);

    const roundId = String(settlementEvent!.payload.roundId);
    const diceRound = await prisma.diceRound.findFirstOrThrow({ where: { roundId } });
    assert.equal(parseAmount(diceRound.matchedPool!.toString()), 200);
    assert.equal(parseAmount(diceRound.adminFee!.toString()), 20);
    assert.equal(parseAmount(diceRound.winnerPayout!.toString()), 180);
    assert.equal(diceRound.settlementId, `settle-${roundId}`);

    const feeTx = await prisma.walletTransaction.findFirst({
      where: { type: 'PLATFORM_FEE', idempotencyKey: `settle-${roundId}-platform-fee` },
    });
    assert.ok(feeTx);
    assert.equal(parseAmount(feeTx.amount.toString()), 20);
  });

  it('TEST 7: duplicate settlement — only one payout and one admin fee', async () => {
    resetRoundSettlements();
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('tanya@games.local');

    await setBalance(playerA.id, 2000);
    await setBalance(playerB.id, 2000);

    const session = await setupHumanVsHumanSession(playerA.id, playerB.id);

    const { rollResult } = await playRound(session.id, [1, 1], 'ODD', 100);
    const settlementEvent = rollResult!.events.find((e) => e.type === 'dice:settlement')!;
    const roundId = String(settlementEvent.payload.roundId);
    const sessionRow = await prisma.gameSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { game: true },
    });

    const balanceAfterSettlement = await getAvailableBalance(playerA.id);
    const adminAfterSettlement = await getAvailableBalance((await getUser('admin@games.local')).id);

    await diceService.handleEngineEvents(
      sessionRow,
      [settlementEvent] as never[],
      { userId: playerA.id, action: 'DUPLICATE_SETTLE', payload: {} },
    );
    await diceService.handleEngineEvents(
      sessionRow,
      [settlementEvent] as never[],
      { userId: playerA.id, action: 'DUPLICATE_SETTLE', payload: {} },
    );

    assert.equal(await prisma.diceRound.count({ where: { roundId } }), 1);
    assert.equal(
      await prisma.walletTransaction.count({ where: { type: 'PLATFORM_FEE', referenceId: roundId } }),
      1,
    );
    assert.equal(await getAvailableBalance(playerA.id), balanceAfterSettlement);
    assert.equal(
      await getAvailableBalance((await getUser('admin@games.local')).id),
      adminAfterSettlement,
    );
  });

  it('TEST 9: TIGER auto-matches main bet without debiting a broke opponent', async () => {
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('arjun@games.local');
    await setBalance(playerA.id, 1000);
    await setBalance(playerB.id, 5);

    const session = await setupHumanVsHumanSession(playerA.id, playerB.id);
    const state = await loadSessionState(session.id);
    const holderId = getHolderActorId(state);

    await persistEngineAction(session.id, {
      userId: holderId,
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'ODD' },
    });

    const st = await loadSessionState(session.id);
    assert.equal(st.mainBet?.opponentStake, 100);
    assert.equal(st.phase, 'BETTING');
    assert.equal(await getAvailableBalance(playerB.id), 5);
    assert.ok(await getAvailableBalance(playerA.id) <= 900);
  });

  it('TIGER: human $100 vs bot $100 uses same pool settlement', async () => {
    const playerA = await getUser('player1@games.local');
    const admin = await getUser('admin@games.local');
    await setBalance(playerA.id, 5000);
    const adminBefore = await getAvailableBalance(admin.id);
    const balanceBefore = await getAvailableBalance(playerA.id);

    const session = await setupSession(playerA.id);

    const { rollResult } = await playRound(session.id, [1, 1], 'ODD', 100);
    const result = rollResult!.events.find((e) => e.type === 'dice:settlement')!.payload.result as DiceRoundResult;
    assert.equal(result.matchedPool, 200);
    assert.equal(result.adminFee, 20);
    assert.equal(result.winnerPayout, 180);

    const balanceAfter = await getAvailableBalance(playerA.id);
    assert.equal(balanceAfter, balanceBefore - 100 + 180);
    assert.equal(await getAvailableBalance(admin.id), adminBefore + 20);
  });

  it('turn deadline persists in Postgres and survives reload', async () => {
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('vikram@games.local');
    const session = await setupSession(playerA.id, playerB.id);
    const state = await loadSessionState(session.id);
    assert.ok(state.turnDeadlineAt);
    assert.ok(state.turnStartedAt);
    assert.ok(state.turnTimerId);
    const remainingBefore = getTurnRemainingMs(state);

    const reloaded = await loadSessionState(session.id);
    assert.equal(reloaded.turnDeadlineAt, state.turnDeadlineAt);
    assert.equal(reloaded.turnStartedAt, state.turnStartedAt);
    assert.ok(getTurnRemainingMs(reloaded) <= remainingBefore);
    assert.ok(getTurnRemainingMs(reloaded) > 0);
  });

  it('timeout advances game without financial settlement when no bet placed', async () => {
    resetTurnTimerSchedulerForTests();
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('neha@games.local');
    const session = await setupHumanVsHumanSession(playerA.id, playerB.id);
    const before = await loadSessionState(session.id);
    const timerId = before.turnTimerId!;
    const holderBefore = before.activeMatch!.holderSeatIndex;
    before.turnDeadlineAt = new Date(Date.now() - 1000).toISOString();
    diceGameEngine.loadState(session.id, before);
    await prisma.gameSession.update({ where: { id: session.id }, data: { state: before as object } });

    await handleTurnTimeout(session.id, timerId);
    const after = await loadSessionState(session.id);
    assert.notEqual(after.activeMatch!.holderSeatIndex, holderBefore);
    assert.equal(after.mainBet, null);
    assert.equal(await prisma.bet.count({ where: { sessionId: session.id } }), 0);
    assert.equal(await prisma.diceRound.count({ where: { sessionId: session.id } }), 0);
  });

  it('turn timeout with a main bet opens SIDE_BETTING and arms the phase timer', async () => {
    resetTurnTimerSchedulerForTests();
    const playerA = await getUser('player1@games.local');
    const playerB = await getUser('rahul@games.local');
    await setBalance(playerA.id, 1000);
    const session = await setupHumanVsHumanSession(playerA.id, playerB.id);
    const before = await loadSessionState(session.id);
    const timerId = before.turnTimerId!;
    const holderId = getHolderActorId(before);

    await persistEngineAction(session.id, {
      userId: holderId,
      action: DICE_ACTIONS.PLACE_MAIN_BET,
      payload: { amount: 100, choice: 'EVEN', idempotencyKey: `it-side-${Date.now()}` },
    });

    const armed = await loadSessionState(session.id);
    armed.turnDeadlineAt = new Date(Date.now() - 1000).toISOString();
    diceGameEngine.loadState(session.id, armed);
    await prisma.gameSession.update({ where: { id: session.id }, data: { state: armed as object } });

    await handleTurnTimeout(session.id, timerId);
    const after = await loadSessionState(session.id);
    assert.equal(after.phase, 'SIDE_BETTING');
    assert.ok(after.sideBetWindowEndsAt);
    assert.ok(after.phaseTimerId);
    assert.equal(after.mainBet?.locked, true);
  });
});
