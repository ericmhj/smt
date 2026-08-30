import { eq, desc, and, gte, lte, count, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { tenantConsumptionAccounts, consumptionLedger } from '../../db/schema/consumption.js';
import { tenants } from '../../db/schema/platform.js';
import type { CreditLedgerEntryEvent } from '../kafka/kafka.events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsumptionBalance {
  saldoCreditos: number;
  creditosTotalesAdquiridos: number;
  ultimoSync: string;
}

export interface LedgerEntry {
  id: string;
  tipo: string;
  cantidad: number;
  saldoResultante: number;
  concepto: string;
  perfilDocumento: string | null;
  referencia: string | null;
  createdAt: string;
}

export interface LedgerFilters {
  tipo?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLedger {
  data: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ConsumptionAccountService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Handle a credit.ledger.entry event from Kafka.
   * Idempotent: skips if evento_externo_id already exists.
   * Updates the consumption account with the authoritative balance from license-service.
   */
  async handleLedgerEntry(event: CreditLedgerEntryEvent): Promise<void> {
    const { slug, entry, creditos_totales_adquiridos } = event;

    // 1. Idempotency check: skip if already processed
    const existing = await this.db
      .select({ id: consumptionLedger.id })
      .from(consumptionLedger)
      .where(eq(consumptionLedger.eventoExternoId, entry.id))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Consumption] Evento ${entry.id} ya procesado, omitiendo`);
      return;
    }

    // 2. Resolve tenant by slug
    const tenantResult = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (tenantResult.length === 0) {
      console.warn(`[Consumption] Tenant '${slug}' no encontrado, omitiendo evento ${entry.id}`);
      return;
    }

    const tenantId = tenantResult[0]!.id;

    // 3. Upsert consumption account with authoritative balance
    const existingAccount = await this.db
      .select({ id: tenantConsumptionAccounts.id })
      .from(tenantConsumptionAccounts)
      .where(eq(tenantConsumptionAccounts.tenantId, tenantId))
      .limit(1);

    if (existingAccount.length === 0) {
      await this.db.insert(tenantConsumptionAccounts).values({
        tenantId,
        saldoCreditos: String(entry.saldo_resultante),
        creditosTotalesAdquiridos: creditos_totales_adquiridos,
        ultimoEventoId: entry.id,
        ultimoSync: new Date(),
      });
    } else {
      await this.db
        .update(tenantConsumptionAccounts)
        .set({
          saldoCreditos: String(entry.saldo_resultante),
          creditosTotalesAdquiridos: creditos_totales_adquiridos,
          ultimoEventoId: entry.id,
          ultimoSync: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenantConsumptionAccounts.tenantId, tenantId));
    }

    // 4. Append entry to ledger (immutable)
    await this.db.insert(consumptionLedger).values({
      tenantId,
      eventoExternoId: entry.id,
      tipo: entry.tipo,
      cantidad: String(entry.cantidad),
      saldoResultante: String(entry.saldo_resultante),
      concepto: entry.concepto,
      perfilDocumento: entry.perfil_documento || null,
      referencia: entry.referencia || null,
      metadata: { timestamp: event.timestamp, tenant_id: event.tenant_id },
    });

    console.log(
      `[Consumption] Procesado ${entry.tipo} para tenant '${slug}': ${entry.cantidad > 0 ? '+' : ''}${entry.cantidad} → saldo: ${entry.saldo_resultante}`,
    );
  }

  /**
   * Get the current balance for a tenant.
   */
  async getBalance(tenantId: string): Promise<ConsumptionBalance | null> {
    const result = await this.db
      .select({
        saldoCreditos: tenantConsumptionAccounts.saldoCreditos,
        creditosTotalesAdquiridos: tenantConsumptionAccounts.creditosTotalesAdquiridos,
        ultimoSync: tenantConsumptionAccounts.ultimoSync,
      })
      .from(tenantConsumptionAccounts)
      .where(eq(tenantConsumptionAccounts.tenantId, tenantId))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    return {
      saldoCreditos: parseFloat(String(row.saldoCreditos)),
      creditosTotalesAdquiridos: row.creditosTotalesAdquiridos,
      ultimoSync: row.ultimoSync.toISOString(),
    };
  }

  /**
   * Get paginated ledger history for a tenant.
   */
  async getHistory(tenantId: string, filters: LedgerFilters): Promise<PaginatedLedger> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [eq(consumptionLedger.tenantId, tenantId)];

    if (filters.tipo) {
      conditions.push(eq(consumptionLedger.tipo, filters.tipo));
    }
    if (filters.desde) {
      conditions.push(gte(consumptionLedger.createdAt, new Date(filters.desde)));
    }
    if (filters.hasta) {
      conditions.push(lte(consumptionLedger.createdAt, new Date(filters.hasta)));
    }

    const whereClause = and(...conditions);

    // Count total
    const countResult = await this.db
      .select({ total: count() })
      .from(consumptionLedger)
      .where(whereClause);

    const total = countResult[0]?.total ?? 0;

    // Fetch page
    const rows = await this.db
      .select({
        id: consumptionLedger.id,
        tipo: consumptionLedger.tipo,
        cantidad: consumptionLedger.cantidad,
        saldoResultante: consumptionLedger.saldoResultante,
        concepto: consumptionLedger.concepto,
        perfilDocumento: consumptionLedger.perfilDocumento,
        referencia: consumptionLedger.referencia,
        createdAt: consumptionLedger.createdAt,
      })
      .from(consumptionLedger)
      .where(whereClause)
      .orderBy(desc(consumptionLedger.createdAt))
      .limit(pageSize)
      .offset(offset);

    return {
      data: rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        cantidad: parseFloat(String(r.cantidad)),
        saldoResultante: parseFloat(String(r.saldoResultante)),
        concepto: r.concepto,
        perfilDocumento: r.perfilDocumento,
        referencia: r.referencia,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
