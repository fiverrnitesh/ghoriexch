/**
 * Automatic PLAY DICE room assignment against live Postgres.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { countRealUsers, hasTigerBot, DICE_MAX_REAL_PLAYERS, DICE_SEAT, type DiceGameState } from '@games/game-engine';
import { registerGamePlugins } from '../../games/register-games.js';
import { connectDatabase, disconnectDatabase, prisma } from '../../database/client.js';
import { diceMatchmakingService } from './dice-matchmaking.service.js';
import { roomService } from '../rooms/room.service.js';
import { setDiceTimersEnabled, shutdownDiceSchedulersForTests } from './dice-turn-timer.scheduler.js';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const canRun = !!process.env.DATABASE_URL;
const stamp = `${Date.now()}`;

async function makePlayer(index: number) {
  return prisma.user.create({
    data: {
      email: `mm-play-${stamp}-${index}@test.local`,
      username: `mmplay${stamp}${index}`.slice(0, 32),
      passwordHash: 'test-hash',
      displayName: `MM${index}`,
      wallet: { create: { balance: 10_000, availableBalance: 10_000 } },
    },
  });
}

async function sessionRoom(sessionId: string) {
  const session = await prisma.gameSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { room: true, players: { where: { status: { not: 'LEFT' } } } },
  });
  const state = session.state as unknown as DiceGameState;
  return { session, state, roomId: session.roomId! };
}

async function closeOpenPlayTables() {
  const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
  if (!game) return;
  await prisma.room.updateMany({
    where: { gameId: game.id, status: 'OPEN', isPrivate: false },
    data: { status: 'CLOSED' },
  });
}

describe('Dice automatic room assignment', { skip: !canRun ? 'DATABASE_URL not set' : false }, () => {
  const users: Array<{ id: string }> = [];
  const createdRoomIds = new Set<string>();

  before(async () => {
    setDiceTimersEnabled(true);
    registerGamePlugins();
    await connectDatabase();
    await closeOpenPlayTables();
    for (let i = 0; i < 3; i++) {
      users.push(await makePlayer(i));
    }
  });

  after(async () => {
    await shutdownDiceSchedulersForTests();
    if (createdRoomIds.size > 0) {
      await prisma.room.updateMany({
        where: { id: { in: [...createdRoomIds] } },
        data: { status: 'CLOSED' },
      });
    }
    await disconnectDatabase();
  });

  it('first players share a table: B then C, always 8 occupants', async () => {
    await closeOpenPlayTables();
    const first = await diceMatchmakingService.play(users[0]!.id);
    const a = await sessionRoom(first.session.id);
    createdRoomIds.add(a.roomId);
    assert.equal(hasTigerBot(a.state.seats), true);
    assert.equal(countRealUsers(a.state.seats), 1);
    assert.equal(a.state.seats.filter((s) => s.occupant).length, 8);
    assert.equal(a.state.seats.find((s) => s.occupant?.type === 'USER')?.seatIndex, DICE_SEAT.B);
    assert.deepEqual(a.state.activeMatch, { holderSeatIndex: DICE_SEAT.B, opponentSeatIndex: DICE_SEAT.SHOOT });

    const second = await diceMatchmakingService.play(users[1]!.id);
    const b = await sessionRoom(second.session.id);
    createdRoomIds.add(b.roomId);
    assert.equal(b.roomId, a.roomId);
    assert.equal(countRealUsers(b.state.seats), 2);
    assert.equal(b.state.seats.find((s) => s.occupant?.userId === users[1]!.id)?.seatIndex, DICE_SEAT.C);
  });

  it('8th real player is sent to a new table', async () => {
    await closeOpenPlayTables();
    const seed = await makePlayer(300);
    const first = await diceMatchmakingService.play(seed.id);
    const { roomId } = await sessionRoom(first.session.id);
    createdRoomIds.add(roomId);

    const extras: string[] = [];
    for (let i = 0; i < DICE_MAX_REAL_PLAYERS - 1; i++) {
      const u = await makePlayer(310 + i);
      const result = await diceMatchmakingService.play(u.id);
      extras.push((await sessionRoom(result.session.id)).roomId);
    }
    for (const id of extras) {
      createdRoomIds.add(id);
      assert.equal(id, roomId);
    }
    const full = await sessionRoom(first.session.id);
    assert.equal(countRealUsers(full.state.seats), DICE_MAX_REAL_PLAYERS);

    const overflow = await makePlayer(399);
    const next = await diceMatchmakingService.play(overflow.id);
    const overflowRoom = await sessionRoom(next.session.id);
    createdRoomIds.add(overflowRoom.roomId);
    assert.notEqual(overflowRoom.roomId, roomId);
    assert.equal(countRealUsers(overflowRoom.state.seats), 1);
    assert.equal(hasTigerBot(overflowRoom.state.seats), true);
  });

  it('TIGER is present and is not a real seat', async () => {
    await closeOpenPlayTables();
    const a = await makePlayer(200);
    const first = await diceMatchmakingService.play(a.id);
    const roomA = await sessionRoom(first.session.id);
    createdRoomIds.add(roomA.roomId);
    assert.equal(hasTigerBot(roomA.state.seats), true);
    assert.equal(countRealUsers(roomA.state.seats), 1);
    assert.equal(roomA.state.maxSeats, 8);

    const b = await makePlayer(201);
    const second = await diceMatchmakingService.play(b.id);
    const roomB = await sessionRoom(second.session.id);
    createdRoomIds.add(roomB.roomId);
    assert.equal(roomB.roomId, roomA.roomId);
    assert.equal(countRealUsers(roomB.state.seats), 2);
  });

  it('admin lists live rooms; play payload has no room code', async () => {
    const live = await roomService.adminListLiveDice();
    assert.ok(Array.isArray(live));
    assert.ok(live.length >= 1);
    for (const room of live) {
      assert.ok(room.id);
      assert.ok(typeof room.realPlayerCount === 'number');
      assert.equal(room.maxRealPlayers, DICE_MAX_REAL_PLAYERS);
      assert.ok('tigerPresent' in room);
      assert.ok('phase' in room);
      assert.ok('seatedPlayers' in room);
    }
    const play = await diceMatchmakingService.play(users[0]!.id);
    assert.deepEqual(Object.keys(play), ['session']);
    assert.deepEqual(Object.keys(play.session), ['id']);
  });
});
