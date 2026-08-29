import { dicePlayLockPrisma, prisma } from '../../database/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { roomService } from '../rooms/room.service.js';
import { sessionService } from '../sessions/session.service.js';
import { SIMULATION_ROOM_CODE } from './dice-simulation.constants.js';
import { countRealUsers, hasTigerBot, type DiceGameState } from '@games/game-engine';

const DICE_PLAY_LOCK_KEY = 74200102;
const MAX_REAL_PLAYERS = 7;

type PlayRoomMeta = {
  gameMode?: string;
  isSystemRoom?: boolean;
  simulationRoom?: boolean;
};

/** Serializes PLAY DICE in-process, then holds a session-scoped Postgres advisory lock. */
let playQueue: Promise<unknown> = Promise.resolve();

function withDicePlayLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = playQueue.then(
    () => acquirePlayLock(fn),
    () => acquirePlayLock(fn),
  );
  playQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function acquirePlayLock<T>(fn: () => Promise<T>): Promise<T> {
  await dicePlayLockPrisma.$executeRaw`SELECT pg_advisory_lock(${DICE_PLAY_LOCK_KEY})`;
  try {
    return await fn();
  } finally {
    await dicePlayLockPrisma.$executeRaw`SELECT pg_advisory_unlock(${DICE_PLAY_LOCK_KEY})`;
  }
}

function isAssignableRoom(meta: PlayRoomMeta, code: string): boolean {
  if (code === SIMULATION_ROOM_CODE) return false;
  if (meta.gameMode === 'FRIENDS') return false;
  if (meta.isSystemRoom) return false;
  if (meta.simulationRoom) return false;
  return true;
}

function realPlayerCount(state: DiceGameState | null, fallback: number): number {
  if (!state?.seats) return fallback;
  return countRealUsers(state.seats);
}

export class DiceMatchmakingService {
  async play(userId: string): Promise<{ session: { id: string } }> {
    return withDicePlayLock(async () => {
      const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
      if (!game || game.status !== 'ACTIVE') throw new NotFoundError('Dice game not available');
      const maxReal = Math.min(game.maxPlayers, MAX_REAL_PLAYERS);

      const existing = await prisma.gamePlayer.findFirst({
        where: {
          userId,
          status: { not: 'LEFT' },
          session: {
            isTestMode: false,
            status: { in: ['WAITING', 'IN_PROGRESS'] },
            game: { slug: 'dice' },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });
      if (existing) {
        await sessionService.joinSession(existing.sessionId, userId);
        return { session: { id: existing.sessionId } };
      }

      const rooms = await prisma.room.findMany({
        where: { gameId: game.id, status: 'OPEN', isPrivate: false },
        include: {
          sessions: {
            where: { status: { in: ['WAITING', 'IN_PROGRESS'] }, isTestMode: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { players: { where: { status: { not: 'LEFT' } } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const room of rooms) {
        const meta = (room.metadata ?? {}) as PlayRoomMeta;
        if (!isAssignableRoom(meta, room.code)) continue;
        const live = room.sessions[0];
        if (!live) continue;
        const state = live.state as unknown as DiceGameState | null;
        const occupiedReal = realPlayerCount(state, live.players.length);
        if (occupiedReal >= maxReal) continue;
        try {
          const session = await sessionService.joinSession(live.id, userId);
          return { session: { id: session.id } };
        } catch {
          continue;
        }
      }

      const room = await roomService.create({
        gameId: game.id,
        hostUserId: userId,
        name: 'Dice Table',
        gameMode: 'ONLINE',
        maxPlayers: maxReal,
        minBet: game.minBet ? parseFloat(game.minBet.toString()) : undefined,
        maxBet: game.maxBet ? parseFloat(game.maxBet.toString()) : undefined,
        isPrivate: false,
      });
      const created = await sessionService.createSession('dice', userId, room.id);
      const session = await sessionService.joinSession(created.id, userId);
      const seated = await prisma.gameSession.findUnique({ where: { id: session.id } });
      const seatedState = seated?.state as unknown as DiceGameState | null;
      if (seatedState && !hasTigerBot(seatedState.seats)) {
        throw new Error('Automatically created Dice room is missing Shoot bot');
      }
      return { session: { id: session.id } };
    });
  }
}

export const diceMatchmakingService = new DiceMatchmakingService();
