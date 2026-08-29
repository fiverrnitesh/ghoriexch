import { prisma } from '../../database/client.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import { generateRoomCode, decimalToString } from '../../lib/utils.js';
import { auditService } from '../audit/audit.service.js';
import { env } from '../../config/env.js';
import { SIMULATION_ROOM_CODE } from '../dice/dice-simulation.constants.js';
import {
  countRealUsers,
  getPhaseRemainingMs,
  getTurnRemainingMs,
  hasTigerBot,
  type DiceGameState,
} from '@games/game-engine';

export class RoomService {
  async create(input: {
    gameId: string;
    hostUserId: string;
    name: string;
    maxPlayers: number;
    minBet?: number;
    maxBet?: number;
    isPrivate?: boolean;
    gameMode?: 'ONLINE' | 'FRIENDS';
    isSystemRoom?: boolean;
  }) {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new ConflictError('Room name is required');
    }

    const game = await prisma.game.findUnique({ where: { id: input.gameId } });
    if (!game || game.status !== 'ACTIVE') {
      throw new NotFoundError('Game not available');
    }

    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const existing = await prisma.room.findUnique({ where: { code } });
      if (!existing) break;
      code = generateRoomCode();
    }

    const gameMode = input.gameMode ?? 'ONLINE';
    const room = await prisma.room.create({
      data: {
        gameId: input.gameId,
        hostUserId: input.hostUserId,
        name: trimmedName,
        code,
        maxPlayers: input.maxPlayers,
        minBet: input.minBet,
        maxBet: input.maxBet,
        isPrivate: gameMode === 'FRIENDS' || (input.isPrivate ?? false),
        metadata: {
          gameMode,
          isSystemRoom: Boolean(input.isSystemRoom),
          acceptedParticipantIds: [input.hostUserId],
          pendingJoinRequests: [],
        },
        status: 'OPEN',
      },
      include: { game: true },
    });

    await auditService.log({
      actorId: input.hostUserId,
      action: 'ROOM_CREATE',
      targetType: 'room',
      targetId: room.id,
      after: { code: room.code, name: room.name, gameId: room.gameId },
    });

    return this.formatRoom(room, 0);
  }

  async adminGetById(roomId: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        game: { select: { id: true, slug: true, name: true } },
        host: { select: { id: true, username: true, displayName: true } },
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } },
          include: {
            players: {
              where: { status: { not: 'LEFT' } },
              include: { user: { select: { id: true, username: true, displayName: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!room) throw new NotFoundError('Room not found');

    const activeSession = room.sessions[0];
    const dice = diceAdminSnapshot(activeSession?.state, activeSession?.players ?? []);
    return {
      ...this.formatRoom(room, dice?.realPlayerCount ?? activeSession?.players.length ?? 0),
      game: room.game,
      host: room.host,
      tigerPresent: dice?.tigerPresent ?? false,
      realPlayerCount: dice?.realPlayerCount ?? activeSession?.players.length ?? 0,
      maxRealPlayers: 6,
      dice,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            status: activeSession.status,
            isTestMode: activeSession.isTestMode,
            roundNumber: activeSession.roundNumber,
            players: activeSession.players.map((p) => ({
              userId: p.userId,
              username: p.user.username,
              displayName: p.user.displayName,
              seatIndex: p.seatIndex,
              status: p.status,
            })),
          }
        : null,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async adminListAll(page = 1, pageSize = 50, params?: { gameId?: string; status?: string }) {
    const where: Record<string, unknown> = {
      code: { notIn: ['SIM-DICE-01', 'DEMO-DICE-01'] },
    };
    if (params?.gameId) where.gameId = params.gameId;
    if (params?.status) where.status = params.status;

    const skip = (page - 1) * pageSize;
    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where,
        include: {
          game: { select: { slug: true, name: true } },
          sessions: {
            where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } },
            include: { players: { where: { status: { not: 'LEFT' } } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.room.count({ where }),
    ]);

    return {
      items: rooms.map((r) => {
        const activeSession = r.sessions[0];
        return {
          ...this.formatRoom(r, activeSession?.players.length ?? 0),
          game: r.game,
          activeGame: activeSession ? r.game.name : null,
          roundNumber: activeSession?.roundNumber ?? null,
          sessionId: activeSession?.id ?? null,
          isTestMode: activeSession?.isTestMode ?? false,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async adminListLiveDice() {
    const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
    if (!game) return [];

    const rooms = await prisma.room.findMany({
      where: {
        gameId: game.id,
        status: { in: ['OPEN', 'FULL', 'IN_GAME'] },
      },
      include: {
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            players: {
              where: { status: { not: 'LEFT' } },
              include: { user: { select: { id: true, username: true, displayName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rooms
      .filter((room) => {
        if (!room.sessions[0] || room.sessions[0].isTestMode) return false;
        if (room.code === 'SIM-DICE-01' || room.code === 'DEMO-DICE-01') return false;
        if (/demo|simulation/i.test(room.name)) return false;
        return true;
      })
      .map((room, index) => {
        const session = room.sessions[0]!;
        const dice = diceAdminSnapshot(session.state, session.players);
        return {
          id: room.id,
          label: `Room #${index + 1}`,
          status: room.status,
          createdAt: room.createdAt.toISOString(),
          realPlayerCount: dice.realPlayerCount,
          maxRealPlayers: 6,
          tigerPresent: dice.tigerPresent,
          seatedPlayers: dice.seatedPlayers,
          activePlayer: dice.activePlayer,
          opponent: dice.opponent,
          roundNumber: session.roundNumber,
          phase: dice.phase,
          remainingTimerSeconds: dice.remainingTimerSeconds,
          currentBets: dice.currentBets,
          dice: dice.dice,
          settlement: dice.settlement,
          sessionId: session.id,
        };
      });
  }

  async listDiceLobby(gameId: string) {
    const rooms = await prisma.room.findMany({
      where: { gameId, status: 'OPEN' },
      include: {
        host: { select: { id: true, displayName: true, username: true } },
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { players: { where: { status: { not: 'LEFT' } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rooms
      .filter((room) => {
        const meta = (room.metadata ?? {}) as { isSystemRoom?: boolean; simulationRoom?: boolean };
        const isDevSim = env.isDev && room.code === SIMULATION_ROOM_CODE;
        if (isDevSim) return true;
        if (meta.isSystemRoom) return false;
        if (meta.simulationRoom) return false;
        if (/integration test/i.test(room.name)) return false;
        if (!room.sessions[0] || room.sessions[0].isTestMode) return false;
        return true;
      })
      .map((room) => {
        const meta = (room.metadata ?? {}) as { gameMode?: 'ONLINE' | 'FRIENDS' };
        const activeSession = room.sessions[0];
        const isDevSim = env.isDev && room.code === SIMULATION_ROOM_CODE;
        return {
          ...this.formatRoom(room, activeSession?.players.length ?? 0),
          gameMode: meta.gameMode ?? 'ONLINE',
          hostName: room.host?.displayName ?? room.host?.username ?? 'Host',
          sessionId: activeSession?.id ?? null,
          joinable: Boolean(activeSession),
          isSimulation: isDevSim,
        };
      })
      .sort((a, b) => Number(Boolean(b.isSimulation)) - Number(Boolean(a.isSimulation)));
  }

  async requestFriendsJoin(roomId: string, userId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.status !== 'OPEN') throw new NotFoundError('Room not available');
    const meta = room.metadata as {
      gameMode?: string;
      pendingJoinRequests?: Array<{ userId: string; requestedAt: string }>;
      acceptedParticipantIds?: string[];
    };
    if (meta.gameMode !== 'FRIENDS') throw new ConflictError('Room is not friends mode');
    if (meta.acceptedParticipantIds?.includes(userId)) {
      return { status: 'ALREADY_ACCEPTED' as const };
    }
    const pending = meta.pendingJoinRequests ?? [];
    if (pending.some((r) => r.userId === userId)) {
      return { status: 'PENDING' as const };
    }
    pending.push({ userId, requestedAt: new Date().toISOString() });
    await prisma.room.update({
      where: { id: roomId },
      data: { metadata: { ...meta, pendingJoinRequests: pending } },
    });
    return { status: 'REQUESTED' as const };
  }

  async resolveFriendsAdmission(roomId: string, hostUserId: string, targetUserId: string, accept: boolean) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('Room not found');
    if (room.hostUserId !== hostUserId) throw new ConflictError('Only the room host can admit players');
    const meta = room.metadata as {
      gameMode?: string;
      pendingJoinRequests?: Array<{ userId: string; requestedAt: string }>;
      acceptedParticipantIds?: string[];
    };
    if (meta.gameMode !== 'FRIENDS') throw new ConflictError('Room is not friends mode');

    const pending = (meta.pendingJoinRequests ?? []).filter((r) => r.userId !== targetUserId);
    const accepted = meta.acceptedParticipantIds ?? [hostUserId];
    if (accept && !accepted.includes(targetUserId)) {
      accepted.push(targetUserId);
    }

    await prisma.room.update({
      where: { id: roomId },
      data: {
        metadata: {
          ...meta,
          pendingJoinRequests: pending,
          acceptedParticipantIds: accepted,
        },
      },
    });

    return { accepted: accept, acceptedParticipantIds: accepted };
  }

  async list(params?: { gameId?: string; status?: string }) {
    const result = await this.adminListAll(1, 50, params);
    const items = result.items.filter(
      (r) => r.code !== SIMULATION_ROOM_CODE && !/integration test/i.test(r.name),
    );

    if (!env.isDev) return items;

    const sim = await prisma.room.findUnique({
      where: { code: SIMULATION_ROOM_CODE },
      include: {
        game: { select: { slug: true, name: true } },
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { players: { where: { status: { not: 'LEFT' } } } },
        },
      },
    });
    if (!sim) return items;

    const activeSession = sim.sessions[0];
    return [
      {
        ...this.formatRoom(sim, activeSession?.players.length ?? 0),
        game: sim.game,
        activeGame: activeSession ? sim.game.name : null,
        roundNumber: activeSession?.roundNumber ?? null,
        sessionId: activeSession?.id ?? null,
        isTestMode: activeSession?.isTestMode ?? false,
        isSimulation: true,
      },
      ...items,
    ];
  }

  async getByCode(code: string) {
    const room = await prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        game: true,
        sessions: {
          where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
          include: { players: { where: { status: { not: 'LEFT' } }, include: { user: { select: { id: true, username: true } } } } },
        },
      },
    });

    if (!room) throw new NotFoundError('Room not found');

    const activeSession = room.sessions[0];
    return {
      ...this.formatRoom(room, activeSession?.players.length ?? 0),
      game: { slug: room.game.slug, name: room.game.name },
      sessionId: activeSession?.id ?? null,
      players: activeSession?.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        seatIndex: p.seatIndex,
        status: p.status,
      })) ?? [],
    };
  }

  async close(roomId: string, actorId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('Room not found');
    if (room.status === 'CLOSED') throw new ConflictError('Room already closed');

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await auditService.log({
      actorId,
      action: 'ROOM_CLOSE',
      targetType: 'room',
      targetId: roomId,
      before: { status: room.status },
      after: { status: 'CLOSED' },
    });

    return updated;
  }

  private formatRoom(
    room: {
      id: string;
      gameId: string;
      name: string;
      code: string;
      status: string;
      maxPlayers: number;
      minBet: { toString(): string } | null;
      maxBet: { toString(): string } | null;
      isPrivate: boolean;
      metadata?: unknown;
    },
    playerCount: number,
  ) {
    const meta = (room.metadata ?? {}) as { gameMode?: 'ONLINE' | 'FRIENDS' };
    return {
      id: room.id,
      gameId: room.gameId,
      name: room.name,
      code: room.code,
      status: room.status,
      maxPlayers: room.maxPlayers,
      playerCount,
      minBet: room.minBet ? decimalToString(room.minBet) : null,
      maxBet: room.maxBet ? decimalToString(room.maxBet) : null,
      isPrivate: room.isPrivate,
      gameMode: meta.gameMode ?? 'ONLINE',
    };
  }
}

function adminPhaseLabel(phase: string | undefined): string {
  switch (phase) {
    case 'WAITING_FOR_PLAYERS':
      return 'WAITING';
    case 'BETTING':
      return 'BETTING';
    case 'SIDE_BETTING':
    case 'MAIN_MATCH_CONFIRMED':
      return 'ACCEPTANCE';
    case 'FINAL_LOCK':
    case 'BETTING_LOCKED':
      return 'ROLL READY';
    case 'DICE_ROLLING':
      return 'ROLLING';
    case 'RESULT':
      return 'RESULT';
    case 'SETTLEMENT':
      return 'SETTLEMENT';
    default:
      return phase?.replace(/_/g, ' ') ?? 'WAITING';
  }
}

function occupantName(
  seat: DiceGameState['seats'][number] | undefined,
  players: Array<{ userId: string; user?: { displayName: string | null; username: string } }>,
): string | null {
  const occ = seat?.occupant;
  if (!occ) return null;
  if (occ.type === 'BOT') return occ.name === 'TIGER' ? 'Shoot' : (occ.name ?? 'Shoot');
  const user = players.find((p) => p.userId === occ.userId);
  return user?.user?.displayName ?? user?.user?.username ?? occ.name ?? occ.userId ?? null;
}

function diceAdminSnapshot(
  rawState: unknown,
  players: Array<{ userId: string; user?: { displayName: string | null; username: string } }>,
) {
  const state = (rawState ?? {}) as DiceGameState;
  const seats = state.seats ?? [];
  const holder = state.activeMatch
    ? seats.find((s) => s.seatIndex === state.activeMatch!.holderSeatIndex)
    : undefined;
  const opponent = state.activeMatch
    ? seats.find((s) => s.seatIndex === state.activeMatch!.opponentSeatIndex)
    : undefined;

  let remainingTimerSeconds: number | null = null;
  if (state.phase === 'BETTING') {
    remainingTimerSeconds = Math.ceil(getTurnRemainingMs(state) / 1000);
  } else {
    const phaseMs = getPhaseRemainingMs(state);
    remainingTimerSeconds = phaseMs > 0 ? Math.ceil(phaseMs / 1000) : null;
  }

  const seatedPlayers = seats
    .filter((s) => s.occupant)
    .map((s) => occupantName(s, players) ?? 'Player');

  return {
    tigerPresent: hasTigerBot(seats),
    realPlayerCount: countRealUsers(seats),
    seatedPlayers,
    activePlayer: occupantName(holder, players),
    opponent: occupantName(opponent, players),
    phase: adminPhaseLabel(state.phase),
    remainingTimerSeconds,
    currentBets: state.mainBet
      ? {
          amount: state.mainBet.amount,
          choice: state.mainBet.choice,
          locked: state.mainBet.locked,
        }
      : null,
    dice: state.dice ?? null,
    settlement: state.phase === 'SETTLEMENT' || state.phase === 'RESULT' ? state.phase : null,
  };
}

export const roomService = new RoomService();
