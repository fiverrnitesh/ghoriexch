/**
 * Automatic PLAY DICE room assignment against live Postgres.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { countRealUsers, hasTigerBot, type DiceGameState } from '@games/game-engine';
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
    for (let i = 0; i < 13; i++) {
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

  it('TEST 1–5: fills rooms to 6 real players then opens the next room', async () => {
    const roomOf: string[] = [];
    for (let i = 0; i < 13; i++) {
      const result = await diceMatchmakingService.play(users[i]!.id);
      assert.equal(Object.keys(result.session).join(','), 'id');
      assert.equal('code' in result, false);
      const { roomId, state } = await sessionRoom(result.session.id);
      createdRoomIds.add(roomId);
      roomOf.push(roomId);
      assert.equal(hasTigerBot(state.seats), true);
      assert.ok(countRealUsers(state.seats) <= 6);
    }

    const room1 = roomOf[0]!;
    assert.ok(roomOf.slice(0, 6).every((id) => id === room1), 'players 1–6 share room 1');
    const room2 = roomOf[6]!;
    assert.notEqual(room2, room1);
    assert.ok(roomOf.slice(6, 12).every((id) => id === room2), 'players 7–12 share room 2');
    const room3 = roomOf[12]!;
    assert.notEqual(room3, room1);
    assert.notEqual(room3, room2);

    const r1 = await prisma.gameSession.findFirstOrThrow({
      where: { roomId: room1, status: { in: ['WAITING', 'IN_PROGRESS'] } },
    });
    const s1 = r1.state as unknown as DiceGameState;
    assert.equal(countRealUsers(s1.seats), 6);
    assert.equal(hasTigerBot(s1.seats), true);
    assert.equal(s1.seats.filter((s) => s.occupant).length, 7);
  });

  it('TEST 6: concurrent joins cannot exceed 6 real players per room', async () => {
    await closeOpenPlayTables();
    const extra = [await makePlayer(100), await makePlayer(101), await makePlayer(102), await makePlayer(103), await makePlayer(104)];
    const first = extra[0]!;
    const seeded = await diceMatchmakingService.play(first.id);
    const { roomId } = await sessionRoom(seeded.session.id);
    createdRoomIds.add(roomId);
    for (const u of extra.slice(1)) {
      const joined = await diceMatchmakingService.play(u.id);
      const info = await sessionRoom(joined.session.id);
      createdRoomIds.add(info.roomId);
      assert.equal(info.roomId, roomId);
    }

    const [g, h] = [await makePlayer(105), await makePlayer(106)];
    const [a, b] = await Promise.all([
      diceMatchmakingService.play(g.id),
      diceMatchmakingService.play(h.id),
    ]);
    const infoA = await sessionRoom(a.session.id);
    const infoB = await sessionRoom(b.session.id);
    createdRoomIds.add(infoA.roomId);
    createdRoomIds.add(infoB.roomId);

    const counts = [infoA, infoB].map((info) => countRealUsers(info.state.seats));
    assert.ok(counts.every((n) => n <= 6));
    const sameRoom = infoA.roomId === infoB.roomId;
    if (sameRoom) {
      assert.fail('both concurrent joiners landed in the already-full room');
    }
    const inFull = [infoA, infoB].filter((info) => info.roomId === roomId);
    assert.equal(inFull.length, 1);
    assert.equal(countRealUsers(inFull[0]!.state.seats), 6);
    const overflow = [infoA, infoB].find((info) => info.roomId !== roomId)!;
    assert.equal(countRealUsers(overflow.state.seats), 1);
    assert.equal(hasTigerBot(overflow.state.seats), true);
  });

  it('TEST 7–8 / 10: TIGER is present, unused rooms are reused, TIGER is not a real seat', async () => {
    await closeOpenPlayTables();
    const a = await makePlayer(200);
    const first = await diceMatchmakingService.play(a.id);
    const roomA = await sessionRoom(first.session.id);
    createdRoomIds.add(roomA.roomId);
    assert.equal(hasTigerBot(roomA.state.seats), true);
    assert.equal(countRealUsers(roomA.state.seats), 1);
    assert.ok(roomA.state.maxSeats >= 7);

    const b = await makePlayer(201);
    const second = await diceMatchmakingService.play(b.id);
    const roomB = await sessionRoom(second.session.id);
    createdRoomIds.add(roomB.roomId);
    assert.equal(roomB.roomId, roomA.roomId);
    assert.equal(countRealUsers(roomB.state.seats), 2);
    assert.equal(hasTigerBot(roomB.state.seats), true);
  });

  it('TEST 11–12: admin lists live rooms; play payload has no room code', async () => {
    const live = await roomService.adminListLiveDice();
    assert.ok(Array.isArray(live));
    assert.ok(live.length >= 1);
    for (const room of live) {
      assert.ok(room.id);
      assert.ok(typeof room.realPlayerCount === 'number');
      assert.equal(room.maxRealPlayers, 6);
      assert.ok('tigerPresent' in room);
      assert.ok('phase' in room);
      assert.ok('seatedPlayers' in room);
    }
    const play = await diceMatchmakingService.play(users[0]!.id);
    assert.deepEqual(Object.keys(play), ['session']);
    assert.deepEqual(Object.keys(play.session), ['id']);
  });
});
