import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';

export class NotificationService {
  async create(userId: string, type: NotificationType, title: string, body: string, data?: Record<string, unknown>) {
    return prisma.notification.create({
      data: { userId, type, title, body, data: (data ?? {}) as Prisma.InputJsonValue },
    });
  }

  async list(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        status: n.status,
        title: n.title,
        body: n.body,
        data: n.data,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async markRead(userId: string, notificationId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async unreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, status: 'UNREAD' },
    });
  }
}

export const notificationService = new NotificationService();
