import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';

export interface AuditLogInput {
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  async log(input: AuditLogInput) {
    return prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: input.before as Prisma.InputJsonValue,
        after: input.after as Prisma.InputJsonValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async list(params: { page?: number; pageSize?: number; action?: AuditAction; actorId?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.AdminAuditLogWhereInput = {};
    if (params.action) where.action = params.action;
    if (params.actorId) where.actorId = params.actorId;

    const [items, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, username: true, email: true } },
        },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}

export const auditService = new AuditService();
