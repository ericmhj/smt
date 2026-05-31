export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.deactivate'
  | 'user.login'
  | 'user.logout'
  | 'form.create'
  | 'form.update'
  | 'form.activate'
  | 'form.deactivate'
  | 'form.version.create'
  | 'assignment.create'
  | 'assignment.revoke'
  | 'reactivo.create'
  | 'reactivo.transition'
  | 'reactivo.reject'
  | 'observation.create'
  | 'observation.read'
  | 'signature.upload'
  | 'notification.send'
  | 'access.unauthorized';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorRole: string;
  ipAddress: string;
  details?: Record<string, unknown>;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorRole: string;
  ipAddress: string;
  details: unknown;
  createdAt: string;
}

export interface AuditFilters {
  page?: number;
  pageSize?: number;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
