import { eq, desc, and, count } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { notifications } from '../../db/schema/notifications.js';
import { pushQueue, emailQueue } from './queues.js';
import { NotificationError, NotificationErrorCode } from './notification.errors.js';
import type {
  NotificationPayload,
  NotificationFilters,
  NotificationRecord,
  PaginatedResult,
} from './notification.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class NotificationService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Send a notification by enqueuing it in the appropriate BullMQ queues.
   */
  async send(payload: NotificationPayload): Promise<void> {
    const { recipientId, type, channels, data, recipientEmail } = payload;

    // Always enqueue in push queue for in-app notification
    if (channels.includes('push')) {
      await pushQueue.add('push-notification', {
        recipientId,
        type,
        data,
      });
    }

    // Optionally enqueue in email queue
    if (channels.includes('email') && recipientEmail) {
      const subject = this.buildEmailSubject(type, data);
      const body = this.buildEmailBody(type, data);

      await emailQueue.add('email-notification', {
        recipientEmail,
        subject,
        body,
      });
    }
  }

  /**
   * Get paginated notifications for a user.
   */
  async getByUser(
    userId: string,
    filters: NotificationFilters,
  ): Promise<PaginatedResult<NotificationRecord>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [countResult] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(eq(notifications.recipientId, userId));

    const total = countResult?.total ?? 0;

    const results = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    const data: NotificationRecord[] = results.map((n) => ({
      id: n.id,
      recipientId: n.recipientId,
      type: n.type,
      payload: n.payload,
      isRead: n.isRead,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId: string, actor: JWTPayload): Promise<void> {
    const result = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    const notification = result[0];
    if (!notification) {
      throw new NotificationError(
        404,
        NotificationErrorCode.NOT_FOUND,
        'Notificación no encontrada',
      );
    }

    // Only the recipient can mark their own notifications as read
    if (notification.recipientId !== actor.sub) {
      throw new NotificationError(
        403,
        NotificationErrorCode.UNAUTHORIZED,
        'No tienes permisos para modificar esta notificación',
      );
    }

    await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  }

  /**
   * Get count of unread notifications for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.isRead, false),
        ),
      );

    return result?.total ?? 0;
  }

  private buildEmailSubject(type: string, data: NotificationPayload['data']): string {
    switch (type) {
      case 'state_change':
        return `[SGR] Cambio de estado: ${data.previousState} → ${data.newState}`;
      case 'observation':
        return `[SGR] Nueva observación en reactivo`;
      case 'assignment':
        return `[SGR] Nueva asignación de formulario`;
      case 'rejection':
        return `[SGR] Reactivo rechazado`;
      default:
        return `[SGR] Notificación`;
    }
  }

  private buildEmailBody(type: string, data: NotificationPayload['data']): string {
    const lines: string[] = [];
    lines.push(`Estimado usuario,`);
    lines.push('');

    switch (type) {
      case 'state_change':
        lines.push(
          `El reactivo ha cambiado de estado: ${data.previousState} → ${data.newState}`,
        );
        lines.push(`Responsable: ${data.actorName}`);
        if (data.reason) {
          lines.push(`Motivo: ${data.reason}`);
        }
        break;
      case 'observation':
        lines.push(`Se ha agregado una nueva observación a su reactivo.`);
        lines.push(`Por: ${data.actorName}`);
        break;
      case 'assignment':
        lines.push(`Se le ha asignado un nuevo formulario.`);
        lines.push(`Asignado por: ${data.actorName}`);
        break;
      case 'rejection':
        lines.push(`Su reactivo ha sido rechazado.`);
        lines.push(`Rechazado por: ${data.actorName}`);
        if (data.reason) {
          lines.push(`Motivo: ${data.reason}`);
        }
        break;
      default:
        lines.push(`Tiene una nueva notificación.`);
    }

    lines.push('');
    lines.push(`Fecha: ${data.timestamp}`);
    lines.push('');
    lines.push('Sistema de Gestión de Reactivos');

    return lines.join('\n');
  }
}
