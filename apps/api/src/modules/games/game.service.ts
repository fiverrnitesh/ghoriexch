import type { Prisma, GameStatus } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { decimalToString } from '../../lib/utils.js';

export class GameService {
  async listCatalog(params?: { category?: string; status?: string }) {
    const where: Record<string, unknown> = {};
    if (params?.category) where.category = params.category;
    if (params?.status) where.status = params.status;
    else where.status = 'ACTIVE';

    const games = await prisma.game.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return games.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      description: g.description,
      version: g.version,
      category: g.category,
      provider: g.provider,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      status: g.status,
      thumbnailUrl: g.thumbnailUrl,
    }));
  }

  async getBySlug(slug: string) {
    const game = await prisma.game.findUnique({ where: { slug } });
    if (!game) throw new NotFoundError('Game not found');
    return game;
  }

  async getById(id: string) {
    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundError('Game not found');
    return game;
  }

  async getConfiguration(gameId: string) {
    return prisma.gameConfiguration.findMany({
      where: { gameId, isActive: true },
    });
  }

  async updateConfiguration(
    gameId: string,
    key: string,
    value: Record<string, unknown>,
    actorId: string,
  ) {
    const existing = await prisma.gameConfiguration.findUnique({
      where: { gameId_key: { gameId, key } },
    });

    const config = await prisma.gameConfiguration.upsert({
      where: { gameId_key: { gameId, key } },
      update: { value: value as Prisma.InputJsonValue, isActive: true },
      create: { gameId, key, value: value as Prisma.InputJsonValue },
    });

    const { auditService } = await import('../audit/audit.service.js');
    await auditService.log({
      actorId,
      action: 'GAME_CONFIG_UPDATE',
      targetType: 'game_configuration',
      targetId: config.id,
      before: existing ? { key, value: existing.value } : undefined,
      after: { key, value },
    });

    return config;
  }

  async adminList(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.game.findMany({
        skip,
        take: pageSize,
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { rooms: true, sessions: true, bots: true } } },
      }),
      prisma.game.count(),
    ]);
    return {
      items: items.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        version: g.version,
        category: g.category,
        provider: g.provider,
        status: g.status,
        minPlayers: g.minPlayers,
        maxPlayers: g.maxPlayers,
        minBet: g.minBet ? decimalToString(g.minBet) : null,
        maxBet: g.maxBet ? decimalToString(g.maxBet) : null,
        roomCount: g._count.rooms,
        sessionCount: g._count.sessions,
        botCount: g._count.bots,
      })),
      total,
      page,
      pageSize,
    };
  }

  async adminGetGame(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { configurations: { where: { isActive: true } } },
    });
    if (!game) throw new NotFoundError('Game not found');
    return {
      ...game,
      minBet: game.minBet ? decimalToString(game.minBet) : null,
      maxBet: game.maxBet ? decimalToString(game.maxBet) : null,
      configurations: game.configurations.map((c) => ({
        id: c.id,
        key: c.key,
        value: c.value,
        isActive: c.isActive,
      })),
    };
  }

  async adminUpdateGame(
    gameId: string,
    input: {
      status?: GameStatus;
      minPlayers?: number;
      maxPlayers?: number;
      minBet?: number | null;
      maxBet?: number | null;
      version?: string;
      description?: string;
    },
    actorId: string,
  ) {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundError('Game not found');

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: {
        ...(input.status !== undefined && { status: input.status }),
        ...(input.minPlayers !== undefined && { minPlayers: input.minPlayers }),
        ...(input.maxPlayers !== undefined && { maxPlayers: input.maxPlayers }),
        ...(input.minBet !== undefined && { minBet: input.minBet }),
        ...(input.maxBet !== undefined && { maxBet: input.maxBet }),
        ...(input.version !== undefined && { version: input.version }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    const { auditService } = await import('../audit/audit.service.js');
    await auditService.log({
      actorId,
      action: 'GAME_UPDATE',
      targetType: 'game',
      targetId: gameId,
      before: {
        status: game.status,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        minBet: game.minBet?.toString() ?? null,
        maxBet: game.maxBet?.toString() ?? null,
        version: game.version,
      },
      after: {
        status: updated.status,
        minPlayers: updated.minPlayers,
        maxPlayers: updated.maxPlayers,
        minBet: updated.minBet?.toString() ?? null,
        maxBet: updated.maxBet?.toString() ?? null,
        version: updated.version,
      },
    });

    return updated;
  }
}

export const gameService = new GameService();
