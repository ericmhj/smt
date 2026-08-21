import { eq, and, sql, gte, lte, count, lt } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { tickets, slaConfig } from '../../db/schema/tickets.js';
import { clientes } from '../../db/schema/clientes.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { reactivos } from '../../db/schema/reactivos.js';
import { tenants } from '../../db/schema/platform.js';
import { TicketError, TicketErrorCode } from './ticket.errors.js';
import {
  TICKET_VALID_TRANSITIONS,
  type TicketEstado,
  type CreateTicketDTO,
  type TicketFilters,
  type Pagination,
  type PaginatedResult,
  type TicketResponse,
  type TicketDetalle,
} from './ticket.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class TicketService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Calculate a date that is N business days (Mon-Fri) after the given date.
   */
  private addBusinessDays(startDate: Date, days: number): Date {
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dayOfWeek = result.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }
    return result;
  }

  async create(data: CreateTicketDTO, actor: JWTPayload): Promise<TicketResponse> {
    // Get SLA config for priority
    const sla = await this.db
      .select()
      .from(slaConfig)
      .where(and(eq(slaConfig.prioridad, data.prioridad), eq(slaConfig.activo, true)))
      .limit(1);

    if (sla.length === 0) {
      throw new TicketError(
        400,
        TicketErrorCode.SLA_NOT_CONFIGURED,
        `No hay configuración SLA activa para prioridad: ${data.prioridad}`,
      );
    }

    const slaHoras = sla[0]!.horasLimite;
    const now = new Date();
    const fechaLimite = new Date(now.getTime() + slaHoras * 60 * 60 * 1000);
    const fechaProgramada = this.addBusinessDays(now, 3);

    // Get form's current version
    const formResult = await this.db
      .select({ id: forms.id, currentVersion: forms.currentVersion })
      .from(forms)
      .where(eq(forms.id, data.formId))
      .limit(1);

    if (formResult.length === 0) {
      throw new TicketError(400, TicketErrorCode.NOT_FOUND, 'Formulario no encontrado');
    }

    const formVersionResult = await this.db
      .select({ id: formVersions.id })
      .from(formVersions)
      .where(
        and(
          eq(formVersions.formId, data.formId),
          eq(formVersions.versionNumber, formResult[0]!.currentVersion),
        ),
      )
      .limit(1);

    if (formVersionResult.length === 0) {
      throw new TicketError(400, TicketErrorCode.NOT_FOUND, 'Versión del formulario no encontrada');
    }

    // Get client data for the card and to pre-fill form responses
    const clienteResult = await this.db
      .select({
        nombre: clientes.nombre,
        rfc: clientes.rfc,
        direccionCentroTrabajo: clientes.direccionCentroTrabajo,
        telefono: clientes.telefono,
        actividadPrincipal: clientes.actividadPrincipal,
        contacto: clientes.contacto,
        horarios: clientes.horarios,
      })
      .from(clientes)
      .where(eq(clientes.id, data.clienteId))
      .limit(1);

    const cliente = clienteResult[0];
    const clienteNombre = cliente?.nombre || null;

    // Pre-fill responses with client data (section 6 of the form)
    const preFilledResponses: Record<string, string> = {};
    if (cliente) {
      preFilledResponses.centro_razon_social = cliente.nombre;
      preFilledResponses.objetivo_razon_social = cliente.nombre;
      preFilledResponses.centro_rfc = cliente.rfc;
      preFilledResponses.centro_domicilio = cliente.direccionCentroTrabajo;
      preFilledResponses.objetivo_ubicacion = cliente.direccionCentroTrabajo;
      preFilledResponses.centro_telefono = cliente.telefono;
      preFilledResponses.centro_actividad = cliente.actividadPrincipal;
      preFilledResponses.centro_contacto = cliente.contacto;
      preFilledResponses.centro_horarios = cliente.horarios;
    }

    // Determine tecnico ID (from ticket or default to actor)
    const tecnicoId = data.tecnicoAsignadoId || actor.sub;

    // Create the reactivo (Kanban card) with pre-filled client data
    const reactivoResult = await this.db
      .insert(reactivos)
      .values({
        formId: data.formId,
        formVersionId: formVersionResult[0]!.id,
        tecnicoId,
        state: 'pendiente',
        responses: preFilledResponses,
        fechaProgramada,
        clienteNombre,
      })
      .returning();

    const reactivoId = reactivoResult[0]!.id;

    // Create the ticket
    const identificador = await this.generateIdentificador(actor.tenantSlug);
    const result = await this.db
      .insert(tickets)
      .values({
        identificador,
        clienteId: data.clienteId,
        formId: data.formId,
        tecnicoAsignadoId: data.tecnicoAsignadoId ?? null,
        reactivoId,
        prioridad: data.prioridad,
        slaHoras,
        estado: 'pendiente',
        fechaLimite,
        creadoPor: actor.sub,
      })
      .returning();

    return this.toResponse(result[0]!);
  }

  async transition(
    id: string,
    nuevoEstado: TicketEstado,
    _actor: JWTPayload,
  ): Promise<TicketResponse> {
    const ticket = await this.findById(id);
    if (!ticket) {
      throw new TicketError(404, TicketErrorCode.NOT_FOUND, 'Ticket no encontrado');
    }

    const estadoActual = ticket.estado as TicketEstado;
    const transicionesValidas = TICKET_VALID_TRANSITIONS[estadoActual] ?? [];

    if (!transicionesValidas.includes(nuevoEstado)) {
      throw new TicketError(
        400,
        TicketErrorCode.INVALID_TRANSITION,
        `Transición de '${estadoActual}' a '${nuevoEstado}' no permitida`,
      );
    }

    const result = await this.db
      .update(tickets)
      .set({ estado: nuevoEstado, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();

    return this.toResponse(result[0]!);
  }

  async reassignTecnico(
    id: string,
    tecnicoId: string,
    _actor: JWTPayload,
  ): Promise<TicketResponse> {
    const ticket = await this.findById(id);
    if (!ticket) {
      throw new TicketError(404, TicketErrorCode.NOT_FOUND, 'Ticket no encontrado');
    }

    if (ticket.estado !== 'pendiente') {
      throw new TicketError(
        400,
        TicketErrorCode.REASSIGN_NOT_ALLOWED,
        'Solo se puede reasignar técnico en tickets con estado pendiente',
      );
    }

    const result = await this.db
      .update(tickets)
      .set({ tecnicoAsignadoId: tecnicoId, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();

    // Also update the associated reactivo's tecnicoId so it appears on the new technician's Kanban
    const updatedTicket = result[0]!;
    if (updatedTicket.reactivoId) {
      await this.db
        .update(reactivos)
        .set({ tecnicoId, updatedAt: new Date() })
        .where(eq(reactivos.id, updatedTicket.reactivoId));
    }

    return this.toResponse(updatedTicket);
  }

  async linkReactivo(ticketId: string, reactivoId: string): Promise<TicketResponse> {
    const ticket = await this.findById(ticketId);
    if (!ticket) {
      throw new TicketError(404, TicketErrorCode.NOT_FOUND, 'Ticket no encontrado');
    }

    const result = await this.db
      .update(tickets)
      .set({ reactivoId, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
      .returning();

    return this.toResponse(result[0]!);
  }

  async list(
    filters: TicketFilters,
    pagination: Pagination,
  ): Promise<PaginatedResult<TicketDetalle>> {
    const conditions = this.buildFilterConditions(filters);

    // Count total
    const countResult = await this.db
      .select({ total: count() })
      .from(tickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.total ?? 0;

    // Fetch paginated with joins
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = await this.db
      .select({
        ticket: tickets,
        clienteNombre: clientes.nombre,
        formNombre: forms.name,
        tecnicoNombre: users.name,
        fechaProgramada: reactivos.fechaProgramada,
      })
      .from(tickets)
      .leftJoin(clientes, eq(tickets.clienteId, clientes.id))
      .leftJoin(forms, eq(tickets.formId, forms.id))
      .leftJoin(users, eq(tickets.tecnicoAsignadoId, users.id))
      .leftJoin(reactivos, eq(tickets.reactivoId, reactivos.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(pagination.pageSize)
      .offset(offset)
      .orderBy(tickets.createdAt);

    return {
      data: rows.map((row) => ({
        ...this.toResponse(row.ticket),
        clienteNombre: row.clienteNombre ?? undefined,
        formNombre: row.formNombre ?? undefined,
        tecnicoNombre: row.tecnicoNombre ?? undefined,
        fechaProgramada: row.fechaProgramada ? row.fechaProgramada.toISOString() : undefined,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  async getById(id: string): Promise<TicketDetalle | null> {
    const result = await this.db
      .select({
        ticket: tickets,
        clienteNombre: clientes.nombre,
        formNombre: forms.name,
        tecnicoNombre: users.name,
      })
      .from(tickets)
      .leftJoin(clientes, eq(tickets.clienteId, clientes.id))
      .leftJoin(forms, eq(tickets.formId, forms.id))
      .leftJoin(users, eq(tickets.tecnicoAsignadoId, users.id))
      .where(eq(tickets.id, id))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0]!;
    return {
      ...this.toResponse(row.ticket),
      clienteNombre: row.clienteNombre ?? undefined,
      formNombre: row.formNombre ?? undefined,
      tecnicoNombre: row.tecnicoNombre ?? undefined,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async findById(id: string) {
    const result = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  private buildFilterConditions(filters: TicketFilters) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.clienteId) {
      conditions.push(eq(tickets.clienteId, filters.clienteId));
    }

    if (filters.tecnicoAsignadoId) {
      conditions.push(eq(tickets.tecnicoAsignadoId, filters.tecnicoAsignadoId));
    }

    if (filters.estado) {
      conditions.push(eq(tickets.estado, filters.estado));
    }

    if (filters.prioridad) {
      conditions.push(eq(tickets.prioridad, filters.prioridad));
    }

    if (filters.vencido === true) {
      conditions.push(lt(tickets.fechaLimite, new Date()));
      conditions.push(sql`${tickets.estado} NOT IN ('validado', 'rechazado', 'finalizado')`);
    }

    if (filters.fechaDesde) {
      conditions.push(gte(tickets.createdAt, filters.fechaDesde));
    }

    if (filters.fechaHasta) {
      conditions.push(lte(tickets.createdAt, filters.fechaHasta));
    }

    return conditions;
  }

  private toResponse(row: typeof tickets.$inferSelect): TicketResponse {
    return {
      id: row.id,
      identificador: row.identificador,
      clienteId: row.clienteId,
      formId: row.formId,
      tecnicoAsignadoId: row.tecnicoAsignadoId,
      reactivoId: row.reactivoId,
      prioridad: row.prioridad,
      slaHoras: row.slaHoras,
      estado: row.estado,
      fechaLimite: row.fechaLimite.toISOString(),
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Generates a unique ticket identifier: XXXX-YYYYMMDD-NNN
   * - XXXX: tenant hashId (stored on tenant record)
   * - YYYYMMDD: current date
   * - NNN: sequential counter for that tenant+date combination
   */
  private async generateIdentificador(tenantSlug: string): Promise<string> {
    // Get tenant hashId from the tenants table
    const tenantResult = await this.db
      .select({ hashId: tenants.hashId })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    const prefix = tenantResult[0]?.hashId || '0000';

    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    // Count existing tickets today with same prefix
    const pattern = `${prefix}-${dateStr}-%`;
    const countResult = await this.db
      .select({ total: count() })
      .from(tickets)
      .where(sql`${tickets.identificador} LIKE ${pattern}`);

    const seq = (countResult[0]?.total ?? 0) + 1;
    const seqStr = String(seq).padStart(3, '0');

    return `${prefix}-${dateStr}-${seqStr}`;
  }
}
