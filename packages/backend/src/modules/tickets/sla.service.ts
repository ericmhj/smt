import { eq, and, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { slaConfig, tickets } from '../../db/schema/tickets.js';
import { TicketError, TicketErrorCode } from './ticket.errors.js';
import type { JWTPayload } from '../auth/auth.types.js';

export interface SLAConfigResponse {
  id: string;
  prioridad: string;
  horasLimite: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketOverdue {
  id: string;
  clienteId: string;
  estado: string;
  prioridad: string;
  fechaLimite: string;
  slaHoras: number;
}

export class SLAService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getConfig(): Promise<SLAConfigResponse[]> {
    const configs = await this.db.select().from(slaConfig);
    return configs.map((c) => this.toConfigResponse(c));
  }

  async updateConfig(
    prioridad: string,
    horasLimite: number,
    _actor: JWTPayload,
  ): Promise<SLAConfigResponse> {
    // Try to update existing
    const existing = await this.db
      .select()
      .from(slaConfig)
      .where(eq(slaConfig.prioridad, prioridad))
      .limit(1);

    if (existing.length > 0) {
      const result = await this.db
        .update(slaConfig)
        .set({ horasLimite, updatedAt: new Date() })
        .where(eq(slaConfig.prioridad, prioridad))
        .returning();
      return this.toConfigResponse(result[0]!);
    }

    // Create new
    const result = await this.db
      .insert(slaConfig)
      .values({ prioridad, horasLimite, activo: true })
      .returning();

    return this.toConfigResponse(result[0]!);
  }

  async calculateDeadline(prioridad: string, fechaCreacion: Date): Promise<Date> {
    const config = await this.db
      .select()
      .from(slaConfig)
      .where(and(eq(slaConfig.prioridad, prioridad), eq(slaConfig.activo, true)))
      .limit(1);

    if (config.length === 0) {
      throw new TicketError(
        400,
        TicketErrorCode.SLA_NOT_CONFIGURED,
        `No hay configuración SLA activa para prioridad: ${prioridad}`,
      );
    }

    const horasLimite = config[0]!.horasLimite;
    return new Date(fechaCreacion.getTime() + horasLimite * 60 * 60 * 1000);
  }

  async checkOverdue(): Promise<TicketOverdue[]> {
    const now = new Date();

    const overdueTickets = await this.db
      .select({
        id: tickets.id,
        clienteId: tickets.clienteId,
        estado: tickets.estado,
        prioridad: tickets.prioridad,
        fechaLimite: tickets.fechaLimite,
        slaHoras: tickets.slaHoras,
      })
      .from(tickets)
      .where(
        and(
          lt(tickets.fechaLimite, now),
          sql`${tickets.estado} NOT IN ('validado', 'rechazado', 'finalizado')`,
        ),
      );

    return overdueTickets.map((t) => ({
      id: t.id,
      clienteId: t.clienteId,
      estado: t.estado,
      prioridad: t.prioridad,
      fechaLimite: t.fechaLimite.toISOString(),
      slaHoras: t.slaHoras,
    }));
  }

  isApproachingDeadline(ticket: {
    createdAt: Date | string;
    fechaLimite: Date | string;
    slaHoras: number;
  }): boolean {
    const now = new Date();
    const createdAt =
      typeof ticket.createdAt === 'string'
        ? new Date(ticket.createdAt)
        : ticket.createdAt;
    const fechaLimite =
      typeof ticket.fechaLimite === 'string'
        ? new Date(ticket.fechaLimite)
        : ticket.fechaLimite;

    const totalMs = fechaLimite.getTime() - createdAt.getTime();
    const elapsedMs = now.getTime() - createdAt.getTime();

    if (totalMs <= 0) return true;
    return elapsedMs / totalMs >= 0.8;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private toConfigResponse(row: typeof slaConfig.$inferSelect): SLAConfigResponse {
    return {
      id: row.id,
      prioridad: row.prioridad,
      horasLimite: row.horasLimite,
      activo: row.activo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
