/**
 * Audit Helper for Report Templates Engine
 *
 * Provides a DRY helper function to insert audit log entries for
 * report template, activation, and override changes.
 *
 * @module audit-helper
 * @requirements 15.1, 15.2, 15.3, 15.4
 */

import type { FastifyRequest } from 'fastify';
import type { Database } from '../../db/index.js';
import { auditLogs } from '../../db/schema/audit.js';

export interface AuditLogParams {
  action: string;
  entityType: 'report_template' | 'report_template_activation' | 'report_template_override';
  entityId: string;
  details?: Record<string, unknown>;
}

/**
 * Insert an audit log entry for report template changes.
 * Fire-and-forget: errors are logged but do not propagate to the caller.
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
    console.error('[ReportTemplateAudit] Failed to insert audit log:', error);
  }
}
