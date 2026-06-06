import { and, eq, gte, lte, sql, count } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { Database } from '../../db/index.js';
import { clientes } from '../../db/schema/clientes.js';
import { getRedisClient } from '../../lib/redis.js';
import type {
  ClienteResponse,
  ClienteFilters,
  Pagination,
  PaginatedResult,
} from './cliente.types.js';

const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_PREFIX = 'search:clientes:';

export class BusquedaService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async search(
    query: string,
    filters: ClienteFilters,
    pagination: Pagination,
  ): Promise<PaginatedResult<ClienteResponse>> {
    // Check cache
    const cacheKey = this.buildCacheKey(query, filters, pagination);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Build WHERE conditions
    const conditions = this.buildFilterConditions(filters);

    // Add full-text search condition
    const searchCondition = sql`(
      search_vector @@ plainto_tsquery('spanish', ${query})
      OR ${clientes.nombre} ILIKE ${'%' + query + '%'}
      OR ${clientes.empresa} ILIKE ${'%' + query + '%'}
    )`;
    conditions.push(searchCondition);

    const whereClause = and(...conditions);

    // Count total
    const countResult = await this.db
      .select({ total: count() })
      .from(clientes)
      .where(whereClause);

    const total = countResult[0]?.total ?? 0;

    // Fetch paginated results
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = await this.db
      .select()
      .from(clientes)
      .where(whereClause)
      .limit(pagination.pageSize)
      .offset(offset)
      .orderBy(clientes.createdAt);

    const result: PaginatedResult<ClienteResponse> = {
      data: rows.map((r) => this.toClienteResponse(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };

    // Cache result
    await this.setCache(cacheKey, result);

    return result;
  }

  async invalidateCache(_clienteId?: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Cache invalidation failure is non-critical
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private buildCacheKey(
    query: string,
    filters: ClienteFilters,
    pagination: Pagination,
  ): string {
    const payload = JSON.stringify({ query, filters, pagination });
    const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
    return `${CACHE_PREFIX}${hash}`;
  }

  private async getFromCache(
    key: string,
  ): Promise<PaginatedResult<ClienteResponse> | null> {
    try {
      const redis = getRedisClient();
      const data = await redis.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Cache read failure is non-critical
    }
    return null;
  }

  private async setCache(
    key: string,
    data: PaginatedResult<ClienteResponse>,
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
    } catch {
      // Cache write failure is non-critical
    }
  }

  private buildFilterConditions(filters: ClienteFilters) {
    const conditions: ReturnType<typeof sql>[] = [];

    if (filters.industria) {
      conditions.push(eq(clientes.industria, filters.industria));
    }

    if (filters.etiquetas && filters.etiquetas.length > 0) {
      conditions.push(
        sql`${clientes.etiquetas} @> ${JSON.stringify(filters.etiquetas)}::jsonb`,
      );
    }

    if (filters.asignadoA) {
      conditions.push(eq(clientes.asignadoA, filters.asignadoA));
    }

    if (filters.fechaDesde) {
      conditions.push(gte(clientes.createdAt, filters.fechaDesde));
    }

    if (filters.fechaHasta) {
      conditions.push(lte(clientes.createdAt, filters.fechaHasta));
    }

    if (filters.activo !== undefined) {
      conditions.push(eq(clientes.activo, filters.activo));
    }

    return conditions;
  }

  private toClienteResponse(row: typeof clientes.$inferSelect): ClienteResponse {
    return {
      id: row.id,
      nombre: row.nombre,
      empresa: row.empresa,
      email: row.email,
      telefono: row.telefono,
      direccion: row.direccion,
      industria: row.industria,
      etiquetas: (row.etiquetas as string[]) ?? [],
      asignadoA: row.asignadoA,
      activo: row.activo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
