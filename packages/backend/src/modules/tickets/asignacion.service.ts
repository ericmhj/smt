import { eq, and, sql, count } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reglasAsignacion, tickets } from '../../db/schema/tickets.js';
import { clientes } from '../../db/schema/clientes.js';
import type { JWTPayload } from '../auth/auth.types.js';

export interface ReglaAsignacionResponse {
  id: string;
  nombre: string;
  tipo: string;
  condiciones: unknown;
  activo: boolean;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

interface ReglaUbicacionCondiciones {
  tipo: 'ubicacion';
  regiones: Array<{
    patron: string;
    tecnicoId: string;
  }>;
}

interface ReglaCargaCondiciones {
  tipo: 'carga';
  tecnicoIds: string[];
}

type ReglaCondiciones = ReglaUbicacionCondiciones | ReglaCargaCondiciones;

export class AsignacionService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Execute active assignment rules against a ticket and its client.
   * Returns the tecnicoId of the first matching rule, or null.
   */
  async executeRules(
    ticket: { id: string; clienteId: string },
    cliente?: { direccion?: string | null },
  ): Promise<string | null> {
    // Fetch client if not provided
    let clienteData = cliente;
    if (!clienteData) {
      const result = await this.db
        .select({ direccion: clientes.direccion })
        .from(clientes)
        .where(eq(clientes.id, ticket.clienteId))
        .limit(1);
      clienteData = result[0] ?? { direccion: null };
    }

    // Get active rules ordered by creation date
    const rules = await this.db
      .select()
      .from(reglasAsignacion)
      .where(eq(reglasAsignacion.activo, true))
      .orderBy(reglasAsignacion.createdAt);

    for (const rule of rules) {
      const condiciones = rule.condiciones as unknown as ReglaCondiciones;

      if (rule.tipo === 'ubicacion') {
        const result = this.evaluateUbicacion(
          condiciones as ReglaUbicacionCondiciones,
          clienteData?.direccion ?? null,
        );
        if (result) return result;
      }

      if (rule.tipo === 'carga') {
        const result = await this.evaluateCarga(
          condiciones as ReglaCargaCondiciones,
        );
        if (result) return result;
      }
    }

    return null;
  }

  async getRules(): Promise<ReglaAsignacionResponse[]> {
    const rules = await this.db.select().from(reglasAsignacion);
    return rules.map((r) => this.toResponse(r));
  }

  async createRule(
    data: { nombre: string; tipo: string; condiciones: unknown; activo?: boolean },
    actor: JWTPayload,
  ): Promise<ReglaAsignacionResponse> {
    const result = await this.db
      .insert(reglasAsignacion)
      .values({
        nombre: data.nombre,
        tipo: data.tipo,
        condiciones: data.condiciones,
        activo: data.activo ?? true,
        creadoPor: actor.sub,
      })
      .returning();

    return this.toResponse(result[0]!);
  }

  async updateRule(
    id: string,
    data: { nombre?: string; tipo?: string; condiciones?: unknown; activo?: boolean },
    _actor: JWTPayload,
  ): Promise<ReglaAsignacionResponse> {
    const existing = await this.db
      .select()
      .from(reglasAsignacion)
      .where(eq(reglasAsignacion.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new Error('Regla de asignación no encontrada');
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.nombre !== undefined) updateValues.nombre = data.nombre;
    if (data.tipo !== undefined) updateValues.tipo = data.tipo;
    if (data.condiciones !== undefined) updateValues.condiciones = data.condiciones;
    if (data.activo !== undefined) updateValues.activo = data.activo;

    const result = await this.db
      .update(reglasAsignacion)
      .set(updateValues)
      .where(eq(reglasAsignacion.id, id))
      .returning();

    return this.toResponse(result[0]!);
  }

  async deleteRule(id: string, _actor: JWTPayload): Promise<void> {
    const existing = await this.db
      .select()
      .from(reglasAsignacion)
      .where(eq(reglasAsignacion.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new Error('Regla de asignación no encontrada');
    }

    await this.db.delete(reglasAsignacion).where(eq(reglasAsignacion.id, id));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private evaluateUbicacion(
    condiciones: ReglaUbicacionCondiciones,
    direccion: string | null,
  ): string | null {
    if (!direccion || !condiciones.regiones) return null;

    for (const region of condiciones.regiones) {
      try {
        const regex = new RegExp(region.patron, 'i');
        if (regex.test(direccion)) {
          return region.tecnicoId;
        }
      } catch {
        // If regex is invalid, try substring match
        if (direccion.toLowerCase().includes(region.patron.toLowerCase())) {
          return region.tecnicoId;
        }
      }
    }

    return null;
  }

  private async evaluateCarga(
    condiciones: ReglaCargaCondiciones,
  ): Promise<string | null> {
    if (!condiciones.tecnicoIds || condiciones.tecnicoIds.length === 0) return null;

    // Count open tickets for each tecnico in the pool
    const tecnicoCounts: Array<{ tecnicoId: string; ticketCount: number }> = [];

    for (const tecnicoId of condiciones.tecnicoIds) {
      const result = await this.db
        .select({ total: count() })
        .from(tickets)
        .where(
          and(
            eq(tickets.tecnicoAsignadoId, tecnicoId),
            sql`${tickets.estado} NOT IN ('completado', 'cerrado')`,
          ),
        );

      tecnicoCounts.push({
        tecnicoId,
        ticketCount: result[0]?.total ?? 0,
      });
    }

    // Sort by ticket count ascending
    tecnicoCounts.sort((a, b) => a.ticketCount - b.ticketCount);

    // Check for tie at minimum
    const minCount = tecnicoCounts[0]!.ticketCount;
    const tied = tecnicoCounts.filter((t) => t.ticketCount === minCount);

    // If there's a tie, return null
    if (tied.length > 1) return null;

    return tecnicoCounts[0]!.tecnicoId;
  }

  private toResponse(
    row: typeof reglasAsignacion.$inferSelect,
  ): ReglaAsignacionResponse {
    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      condiciones: row.condiciones,
      activo: row.activo,
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
