import { eq, and, desc, gte, lte, count, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { auditLogs } from '../../db/schema/audit.js';
import type {
  AuditEntry,
  AuditFilters,
  AuditLogRecord,
  PaginatedResult,
} from './audit.types.js';

export class AuditService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Log an audit entry. This is a fire-and-forget operation.
   * Errors are logged but do not propagate to the caller.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        ipAddress: entry.ipAddress,
        details: entry.details ?? null,
      });
    } catch (error) {
      // Fire-and-forget: log the error but don't throw
      console.error('[AuditService] Failed to log audit entry:', error);
    }
  }

  /**
   * Query audit logs with filters and pagination.
   */
  async query(filters: AuditFilters): Promise<PaginatedResult<AuditLogRecord>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions = this.buildConditions(filters);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ total: count() })
      .from(auditLogs)
      .where(whereClause);

    const total = countResult?.total ?? 0;

    const results = await this.db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const data: AuditLogRecord[] = results.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorId: r.actorId,
      actorRole: r.actorRole,
      ipAddress: r.ipAddress,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
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
   * Get audit history for a specific entity.
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
  ): Promise<AuditLogRecord[]> {
    const results = await this.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId),
        ),
      )
      .orderBy(desc(auditLogs.createdAt));

    return results.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorId: r.actorId,
      actorRole: r.actorRole,
      ipAddress: r.ipAddress,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private buildConditions(filters: AuditFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }

    if (filters.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }

    if (filters.actorId) {
      conditions.push(eq(auditLogs.actorId, filters.actorId));
    }

    if (filters.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }

    if (filters.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      conditions.push(lte(auditLogs.createdAt, new Date(filters.dateTo)));
    }

    return conditions;
  }
}
