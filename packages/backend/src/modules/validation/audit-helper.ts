/**
 * Audit Helper for Validation Rules Engine
 *
 * Provides a DRY helper function to insert audit log entries for
 * rule template and override changes.
 *
 * @module audit-helper
 * @requirements 14.1, 14.2, 14.3
 */

import type { FastifyRequest } from 'fastify';
import type { Database } from '../../db/index.js';
import { auditLogs } from '../../db/schema/audit.js';

export interface AuditLogParams {
  action: string;
  entityType: 'rule_template' | 'rule_override';
  entityId: string;
  details?: Record<string, unknown>;
}

/**
 * Insert an audit log entry for validation rule changes.
 * Fire-and-forget: errors are logged but do not propagate to the caller.
 *
 * @param db - The database instance
 * @param request - The Fastify request (used to extract actor info and IP)
 * @param params - The audit log parameters
 */
export async function insertAuditLog(
  db: Database,
  request: FastifyRequest,
  params: AuditLogParams,
): Promise<void> {
  try {
    const actorId = request.user?.sub ?? request.user?.id ?? 'unknown';
    const actorRole = request.user?.role ?? 'unknown';
    const ipAddress = request.ip ?? '0.0.0.0';

    await db.insert(auditLogs).values({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      actorId,
      actorRole,
      ipAddress,
      details: params.details ?? null,
    });
  } catch (error) {
    // Fire-and-forget: log the error but don't throw
    console.error('[AuditHelper] Failed to insert audit log:', error);
  }
}
