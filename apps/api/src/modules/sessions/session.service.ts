import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { generateServerSeedHash, decimalToString } from '../../lib/utils.js';
import { gameRegistry, sanitizePublicDiceState, type DiceGameState } from '@games/game-engine';
import { emitSessionGameEvent } from '../../realtime/socket.server.js';

export class SessionService {
  async createSession(gameSlug: string, hostUserId: string, roomId?: string) {
    const game = await prisma.game.findUnique({ where: { slug: gameSlug } });
    if (!game || game.status !== 'ACTIVE') {
      throw new NotFoundError('Game not available');
    }

    const { seed, hash } = generateServerSeedHash();

    const session = await prisma.gameSession.create({
      data: {
        gameId: game.id,
        roomId,
        status: 'WAITING',
        serverSeedHash: hash,
        serverSeed: seed,
        state: {},
      },
    });

    const plugin = gameRegistry.getPlugin(gameSlug);
    if (plugin) {
      const { initialState } = await plugin.definition.createSession({
        roomId,
        hostUserId,
      });
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { state: initialState as Prisma.InputJsonValue },
      });
    }

    await prisma.gamePlayer.create({
      data: {
        sessionId: session.id,
        userId: hostUserId,
        status: 'JOINED',
        seatIndex: 0,
      },
    });

    return this.formatSession(session.id);
  }

  async joinSession(sessionId: string, userId: string, seatIndex?: number) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true, players: { where: { status: { not: 'LEFT' } } } },
    });

    if (!session) throw new NotFoundError('Session not found');
    if (!['WAITING', 'STARTING', 'IN_PROGRESS'].includes(session.status)) {
      throw new ValidationError('Session not accepting players');
    }

    const existing = session.players.find((p) => p.userId === userId);
    if (existing) {
      const plugin = gameRegistry.getPlugin(session.game.slug);
      if (plugin) {
        await plugin.definition.joinSession({ sessionId, userId, seatIndex: existing.seatIndex ?? undefined });
        const newState = await plugin.definition.getState(sessionId);
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            state: newState as Prisma.InputJsonValue,
            status: session.status === 'WAITING' ? 'IN_PROGRESS' : session.status,
          },
        });
      }
      return this.formatSession(sessionId);
    }

    if (session.players.length >= session.game.maxPlayers) {
      throw new ValidationError('Session is full');
    }

    await prisma.gamePlayer.create({
      data: {
        sessionId,
        userId,
        seatIndex: seatIndex ?? session.players.length,
        status: 'JOINED',
      },
    });

    const plugin = gameRegistry.getPlugin(session.game.slug);
    if (plugin) {
      await plugin.definition.joinSession({ sessionId, userId, seatIndex });
      const newState = await plugin.definition.getState(sessionId);
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          state: newState as Prisma.InputJsonValue,
          status: session.status === 'WAITING' ? 'IN_PROGRESS' : session.status,
        },
      });
    }

    return this.formatSession(sessionId);
  }

  async leaveSession(sessionId: string, userId: string) {
    const player = await prisma.gamePlayer.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });

    if (!player) throw new NotFoundError('Player not in session');

    await prisma.gamePlayer.update({
      where: { id: player.id },
      data: { status: 'LEFT', leftAt: new Date() },
    });

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });

    const plugin = session ? gameRegistry.getPlugin(session.game.slug) : undefined;
    if (plugin) {
      await plugin.definition.leaveSession({ sessionId, userId });
    }

    return { success: true };
  }

  async processAction(sessionId: string, userId: string, action: string, payload: Record<string, unknown>) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });

    if (!session) throw new NotFoundError('Session not found');
    if (session.status !== 'IN_PROGRESS' && session.status !== 'WAITING') {
      throw new ValidationError('Session not active');
    }

    const plugin = gameRegistry.getPlugin(session.game.slug);
    if (!plugin) {
      throw new ValidationError('Game engine not implemented for this game');
    }

    const { state, events } = await plugin.definition.processAction({
      sessionId,
      userId,
      action,
      payload,
    });

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { state: state as Prisma.InputJsonValue, status: session.status === 'WAITING' ? 'IN_PROGRESS' : session.status },
    });

    const publicState = session.game.slug === 'dice'
      ? sanitizePublicDiceState(state as unknown as DiceGameState)
      : state;

    emitSessionGameEvent(sessionId, action, {
      state: publicState as Record<string, unknown>,
      events: events as unknown[],
    });

    return { state: publicState, events };
  }

  async getSession(sessionId: string) {
    return this.formatSession(sessionId);
  }

  async adminGetSession(sessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        game: { select: { slug: true, name: true } },
        room: { select: { id: true, code: true, name: true } },
        players: {
          where: { status: { not: 'LEFT' } },
          include: { user: { select: { id: true, username: true, displayName: true } } },
        },
        bets: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { participants: { include: { user: { select: { username: true } } } } },
        },
      },
    });
    if (!session) throw new NotFoundError('Session not found');

    return {
      id: session.id,
      game: session.game,
      room: session.room,
      status: session.status,
      isTestMode: session.isTestMode,
      roundNumber: session.roundNumber,
      state: session.state,
      result: session.result,
      players: session.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        seatIndex: p.seatIndex,
        status: p.status,
      })),
      bets: session.bets.map((b) => ({
        id: b.id,
        amount: decimalToString(b.amount),
        status: b.status,
        selection: b.selection,
        payout: b.payout ? decimalToString(b.payout) : null,
        createdAt: b.createdAt.toISOString(),
      })),
      startedAt: session.startedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
    };
  }

  async listActive(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.gameSession.findMany({
        where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } },
        include: {
          game: { select: { slug: true, name: true } },
          players: { where: { status: { not: 'LEFT' } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.gameSession.count({ where: { status: { in: ['WAITING', 'IN_PROGRESS', 'SETTLING'] } } }),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        game: s.game,
        status: s.status,
        isTestMode: s.isTestMode,
        roundNumber: s.roundNumber,
        playerCount: s.players.length,
        startedAt: s.startedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  private async formatSession(sessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        game: { select: { slug: true, name: true } },
        players: {
          where: { status: { not: 'LEFT' } },
          include: { user: { select: { id: true, username: true, displayName: true } } },
        },
      },
    });

    if (!session) throw new NotFoundError('Session not found');

    return {
      id: session.id,
      gameId: session.gameId,
      game: session.game,
      roomId: session.roomId,
      status: session.status,
      roundNumber: session.roundNumber,
      serverSeedHash: session.serverSeedHash,
      state: session.state,
      result: session.result,
      players: session.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        seatIndex: p.seatIndex,
        status: p.status,
      })),
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
    };
  }
}

export const sessionService = new SessionService();
