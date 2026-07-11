import { randomUUID } from 'node:crypto';
import { getSqlClient } from '../../db/index.js';
import type { CreditOperation } from './credit.types.js';

export class CreditDebtService {
  /**
   * Register a deferred credit consumption as a pending debt.
   * Returns a debtId for tracking.
   */
  async registerDebt(tenantId: string, operation: CreditOperation): Promise<string> {
    const sql = getSqlClient();
    const debtId = randomUUID();

    await sql.unsafe(`
      INSERT INTO platform.credit_debts (id, tenant_id, operation_type, metadata, status)
      VALUES ('${debtId}', '${tenantId}', '${operation.operationType}', '${JSON.stringify(operation.metadata)}', 'pending')
    `);

    console.log(`[CreditDebt] Deuda registrada: ${debtId} para tenant ${tenantId}`);
    return debtId;
  }
}
