export type NotificationChannel = 'push' | 'email';

export type NotificationType =
  | 'state_change'
  | 'observation'
  | 'assignment'
  | 'rejection';

export interface NotificationData {
  reactivoId?: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  actorName: string;
  timestamp: string;
}

export interface NotificationPayload {
  recipientId: string;
  type: NotificationType;
  channels: NotificationChannel[];
  data: NotificationData;
  recipientEmail?: string;
}

export interface NotificationJobData {
  recipientId: string;
  type: NotificationType;
  data: NotificationData;
}

export interface EmailJobData {
  recipientEmail: string;
  subject: string;
  body: string;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  type: string;
  payload: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
