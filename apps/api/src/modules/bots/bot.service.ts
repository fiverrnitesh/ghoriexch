import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { auditService } from '../audit/audit.service.js';
import type { BotStatus } from '@prisma/client';

export class BotService {
  async list(gameId?: string) {
    const bots = await prisma.bot.findMany({
      where: gameId ? { gameId } : undefined,
      include: { game: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return bots.map((bot) => ({
      id: bot.id,
      gameId: bot.gameId,
      game: bot.game,
      name: bot.name,
      avatarUrl: bot.avatarUrl,
      status: bot.status,
      config: bot.config,
      createdAt: bot.createdAt.toISOString(),
      updatedAt: bot.updatedAt.toISOString(),
    }));
  }

  async getById(botId: string) {
    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: { game: { select: { slug: true, name: true } } },
    });
    if (!bot) throw new NotFoundError('Bot not found');
    return bot;
  }

  async create(input: {
    gameId: string;
    name: string;
    avatarUrl?: string;
    config?: Record<string, unknown>;
    actorId: string;
  }) {
    const bot = await prisma.bot.create({
      data: {
        gameId: input.gameId,
        name: input.name,
        avatarUrl: input.avatarUrl,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        status: 'INACTIVE',
      },
      include: { game: { select: { slug: true, name: true } } },
    });

    await auditService.log({
      actorId: input.actorId,
      action: 'BOT_CREATE',
      targetType: 'bot',
      targetId: bot.id,
      after: { name: bot.name, gameId: bot.gameId, entityType: 'BOT' },
      metadata: { note: 'Bot entity — not a user account' },
    });

    return bot;
  }

  async update(botId: string, input: {
    name?: string;
    avatarUrl?: string | null;
    status?: BotStatus;
    config?: Record<string, unknown>;
    actorId: string;
  }) {
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundError('Bot not found');

    const updated = await prisma.bot.update({
      where: { id: botId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.config !== undefined && { config: input.config as Prisma.InputJsonValue }),
      },
      include: { game: { select: { slug: true, name: true } } },
    });

    await auditService.log({
      actorId: input.actorId,
      action: 'BOT_UPDATE',
      targetType: 'bot',
      targetId: botId,
      before: { name: bot.name, status: bot.status, config: bot.config },
      after: { name: updated.name, status: updated.status, config: updated.config },
    });

    return updated;
  }

  async updateStatus(botId: string, status: BotStatus, actorId: string) {
    return this.update(botId, { status, actorId });
  }
}

export const botService = new BotService();
