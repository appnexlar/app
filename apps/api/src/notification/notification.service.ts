import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDTO, NotificationListResponse } from "@nexlar/shared";

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async create(brokerId: string, type: string, title: string, body: string, actionUrl?: string) {
    const notification = await this.prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        brokerId,
        type,
        title,
        body,
        actionUrl,
      },
    });
    return notification;
  }

  async listByBroker(brokerId: string): Promise<NotificationListResponse> {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { brokerId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.notification.count({
        where: { brokerId, readAt: null },
      }),
    ]);

    const items: NotificationDTO[] = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return { items, unreadCount };
  }

  async markAsRead(brokerId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, brokerId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(brokerId: string) {
    await this.prisma.notification.updateMany({
      where: { brokerId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
