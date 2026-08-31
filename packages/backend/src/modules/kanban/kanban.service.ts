import { eq, and, sql, gte, lte, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos, stateTransitions } from '../../db/schema/reactivos.js';
import { tickets } from '../../db/schema/tickets.js';
import { clientes } from '../../db/schema/clientes.js';
import { forms } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { observations } from '../../db/schema/observations.js';
import { validateTransition } from '../reactivos/state-machine.js';
import { ReactivoService } from '../reactivos/reactivo.service.js';
import { ComplementaryStudyService } from '../reactivos/complementary-study.service.js';
import { KanbanError, KanbanErrorCode } from './kanban.errors.js';
import { ReportChargeService, type ReportChargeConfig } from '../credits/report-charge.service.js';
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanFilters,
} from './kanban.types.js';
import { COLUMN_LABELS as columnLabels } from './kanban.types.js';
import type { ReactivoState, StateTransitionResponse } from '../reactivos/reactivo.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class KanbanService {
  private db: Database;
  private reactivoService: ReactivoService;
  private complementaryStudyService: ComplementaryStudyService;
  private reportChargeService: ReportChargeService;

  constructor(db: Database, reportChargeConfig?: ReportChargeConfig) {
    this.db = db;
    this.reactivoService = new ReactivoService(db);
    this.complementaryStudyService = new ComplementaryStudyService(db);
    // Por defecto standalone (sin cobro) si no se inyecta configuración.
    this.reportChargeService = new ReportChargeService(
      db,
      reportChargeConfig ?? { standaloneAuth: true },
    );
  }

  /**
   * Get the Kanban board with all reactivos grouped by state (columns).
   * Each card includes: reactivo id, form name, technician name, attempt number, state, created_at,
   * and a count of unread observations.
   * Supports filters: by technician, by form, by date range.
   */
  async getBoard(filters?: KanbanFilters): Promise<KanbanBoard> {
    const conditions: SQL[] = [];

    if (filters?.tecnicoId) {
      conditions.push(eq(reactivos.tecnicoId, filters.tecnicoId));
    }

    if (filters?.formId) {
      conditions.push(eq(reactivos.formId, filters.formId));
    }

    if (filters?.dateFrom) {
      conditions.push(gte(reactivos.createdAt, new Date(filters.dateFrom)));
    }

    if (filters?.dateTo) {
      conditions.push(lte(reactivos.createdAt, new Date(filters.dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all reactivos with form name, technician name, and unread observations count
    const results = await this.db
      .select({
        id: reactivos.id,
        formName: forms.name,
        tecnicoName: users.name,
        attemptNumber: reactivos.attemptNumber,
        state: reactivos.state,
        createdAt: reactivos.createdAt,
        // Identificador visible de la tarjeta (del ticket asociado).
        identificador: sql<string | null>`(
          select ${tickets.identificador} from ${tickets}
          where ${tickets.reactivoId} = ${reactivos.id}
          limit 1
        )`,
        // Nombre del cliente: preferir el del ticket asociado (dato real vía clientes),
        // con fallback a reactivos.clienteNombre (llenado al crear desde ticket).
        clienteNombre: sql<string | null>`coalesce(
          (select ${clientes.nombre} from ${tickets}
             join ${clientes} on ${clientes.id} = ${tickets.clienteId}
           where ${tickets.reactivoId} = ${reactivos.id}
           limit 1),
          ${reactivos.clienteNombre}
        )`,
        fechaProgramada: reactivos.fechaProgramada,
        parentReactivoId: reactivos.parentReactivoId,
        responses: reactivos.responses,
        unreadObservations: sql<number>`coalesce((
          select count(*)::int from observations
          where observations.reactivo_id = ${reactivos.id}
          and observations.is_read = false
        ), 0)`,
      })
      .from(reactivos)
      .innerJoin(forms, eq(reactivos.formId, forms.id))
      .innerJoin(users, eq(reactivos.tecnicoId, users.id))
      .where(whereClause);

    // Group results by state into columns
    const states: ReactivoState[] = ['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado'];

    const columns: KanbanColumn[] = states.map((state) => ({
      state,
      label: columnLabels[state],
      cards: results
        .filter((r) => r.state === state)
        .map((r): KanbanCard => {
          // Check if this card is a complementary study
          const resp = r.responses as Record<string, unknown> | null;
          const compMeta = resp?._complementary_metadata as
            | { tipo?: string; anotacion?: string; bloqueadoHasta?: string }
            | undefined;
          const isComplementary = compMeta?.tipo === 'complementario_cumplimiento';

          // Check if the card is still in its lock period
          let isBlocked = false;
          let bloqueadoHasta: string | undefined;
          if (isComplementary && compMeta?.bloqueadoHasta) {
            const lockDate = new Date(compMeta.bloqueadoHasta);
            if (new Date() < lockDate) {
              isBlocked = true;
              bloqueadoHasta = compMeta.bloqueadoHasta;
            }
          }

          return {
            id: r.id,
            identificador: r.identificador || undefined,
            formName: r.formName,
            tecnicoName: r.tecnicoName,
            attemptNumber: r.attemptNumber,
            state: r.state as ReactivoState,
            createdAt: r.createdAt.toISOString(),
            clienteNombre: r.clienteNombre || undefined,
            fechaProgramada: r.fechaProgramada ? r.fechaProgramada.toISOString() : undefined,
            unreadObservations: r.unreadObservations,
            isComplementary,
            parentReactivoId: r.parentReactivoId || undefined,
            complementaryAnnotation: isComplementary ? compMeta?.anotacion : undefined,
            isBlocked,
            bloqueadoHasta,
          };
        }),
    }));

    return { columns };
  }

  /**
   * Execute a state transition on a reactivo.
   * Validates the transition using the state machine, checks actor role,
   * creates a state_transition record, updates reactivo state, and emits notification event.
   */
  async transition(
    reactivoId: string,
    toState: ReactivoState,
    signatureId: string,
    actor: JWTPayload,
    reason?: string,
    ipAddress?: string,
  ): Promise<StateTransitionResponse> {
    // Validate actor has role 'manager'
    if (actor.role !== 'manager') {
      throw new KanbanError(
        403,
        KanbanErrorCode.UNAUTHORIZED_ROLE,
        'Solo el Manager puede ejecutar transiciones de estado',
      );
    }

    // Get current reactivo state
    const reactivoResult = await this.db
      .select({ id: reactivos.id, state: reactivos.state })
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo) {
      throw new KanbanError(
        404,
        KanbanErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    const fromState = reactivo.state as ReactivoState;

    // Validate transition using state-machine
    const validationResult = validateTransition(fromState, {
      toState,
      signatureId,
      reason,
      ipAddress: ipAddress || '0.0.0.0',
    });

    if (!validationResult.valid) {
      throw new KanbanError(
        400,
        KanbanErrorCode.INVALID_TRANSITION,
        validationResult.error || 'Transición inválida',
      );
    }

    // Validate that the signature belongs to the actor performing the transition
    const { signatures } = await import('../../db/schema/signatures.js');
    const sigResult = await this.db
      .select({ userId: signatures.userId })
      .from(signatures)
      .where(eq(signatures.id, signatureId))
      .limit(1);

    if (sigResult.length === 0) {
      throw new KanbanError(
        404,
        KanbanErrorCode.INVALID_TRANSITION,
        'Firma no encontrada',
      );
    }

    if (sigResult[0]!.userId !== actor.sub) {
      throw new KanbanError(
        403,
        KanbanErrorCode.UNAUTHORIZED_ROLE,
        'La firma utilizada no pertenece al usuario que ejecuta la transición',
      );
    }

    // Create state_transition record
    const transitionResult = await this.db
      .insert(stateTransitions)
      .values({
        reactivoId,
        fromState,
        toState,
        actorId: actor.sub,
        signatureId,
        reason: reason || null,
        ipAddress: ipAddress || '0.0.0.0',
      })
      .returning();

    const transition = transitionResult[0]!;

    // Update reactivo state
    const updateValues: { state: ReactivoState; updatedAt: Date; rejectionReason?: string } = {
      state: toState,
      updatedAt: new Date(),
    };

    // If transitioning to 'rechazado', set rejection_reason on reactivo
    if (toState === 'rechazado' && reason) {
      updateValues.rejectionReason = reason;
    }

    await this.db
      .update(reactivos)
      .set(updateValues)
      .where(eq(reactivos.id, reactivoId));

    // Emit notification event (for now just log, notification module comes later)
    // TODO: Replace with actual notification event emission
    console.log(
      `[Kanban] State transition: reactivo=${reactivoId} from=${fromState} to=${toState} actor=${actor.sub}`,
    );

    // Hook: Sync reactivo state with associated ticket
    await this.syncTicketState(reactivoId, toState);

    // Hook: Cargo variable automático al finalizar el reporte.
    // Aplica con el mismo criterio a reactivos normales y complementarios.
    // Si el cobro no procede (mapeo ausente, matrices inconsistentes, saldo
    // insuficiente o servicio caído), el reporte se marca DRAFT.
    if (toState === 'finalizado') {
      await this.applyVariableCharge(reactivoId, actor);
    }

    // Hook: Auto-create complementary compliance study when transitioning to 'finalizado'
    if (toState === 'finalizado') {
      try {
        const complementary = await this.complementaryStudyService.autoCreateIfNeeded(
          reactivoId,
          actor,
        );
        if (complementary) {
          console.log(
            `[Kanban] Auto-created complementary study ${complementary.id} for finalized reactivo ${reactivoId}`,
          );
        }
      } catch (err) {
        // Non-critical: log and continue (don't fail the transition)
        console.error(
          `[Kanban] Error auto-creating complementary study for reactivo ${reactivoId}:`,
          err,
        );
      }
    }

    return {
      id: transition.id,
      reactivoId: transition.reactivoId,
      fromState: transition.fromState as ReactivoState,
      toState: transition.toState as ReactivoState,
      actorId: transition.actorId,
      signatureId: transition.signatureId,
      reason: transition.reason,
      createdAt: transition.createdAt.toISOString(),
    };
  }

  /**
   * Aplica el cargo variable al finalizar un reporte. Lee las respuestas del
   * reactivo (incluyendo el HTML renderizado real), delega en ReportChargeService
   * y, si el cobro no procede, marca el reporte para PDF con marca DRAFT.
   * Non-blocking: nunca falla la transición.
   */
  private async applyVariableCharge(reactivoId: string, actor: JWTPayload): Promise<void> {
    try {
      const row = (
        await this.db
          .select({ responses: reactivos.responses })
          .from(reactivos)
          .where(eq(reactivos.id, reactivoId))
          .limit(1)
      )[0];

      if (!row) return;

      const responses = (row.responses || {}) as Record<string, unknown>;

      const result = await this.reportChargeService.chargeOnFinalize(
        reactivoId,
        responses,
        actor.tenantSlug,
        actor.sub,
      );

      if (result.charged) {
        console.log(
          `[Kanban] Cargo variable aplicado: reactivo=${reactivoId}, puntos=${result.numeroPuntos}`,
        );
        // Éxito: asegurar que no quede una marca DRAFT previa.
        await this.setDraftFlag(reactivoId, responses, null);
        return;
      }

      // No se cobró. Marcar DRAFT salvo en modo standalone.
      console.warn(
        `[Kanban] Cargo variable NO aplicado (reactivo=${reactivoId}): ${result.reason} — ${result.message}`,
      );
      if (result.draft) {
        await this.setDraftFlag(reactivoId, responses, {
          reason: result.reason,
          message: result.message,
          numeroPuntos: result.numeroPuntos ?? null,
        });
      }
    } catch (err) {
      // Non-critical: log y continuar (no romper la transición).
      console.error(`[Kanban] Error aplicando cargo variable a reactivo ${reactivoId}:`, err);
    }
  }

  /**
   * Persiste (o limpia) la marca DRAFT del reporte en responses._draft.
   * La generación del PDF consulta esta marca para renderizar la marca de agua.
   */
  private async setDraftFlag(
    reactivoId: string,
    responses: Record<string, unknown>,
    draft: { reason: string; message: string; numeroPuntos: number | null } | null,
  ): Promise<void> {
    const updated: Record<string, unknown> = { ...responses };
    if (draft) {
      updated._draft = {
        isDraft: true,
        motivo: draft.reason,
        detalle: draft.message,
        numeroPuntos: draft.numeroPuntos,
        marcadoEn: new Date().toISOString(),
      };
    } else {
      delete updated._draft;
    }

    await this.db
      .update(reactivos)
      .set({ responses: updated, updatedAt: new Date() })
      .where(eq(reactivos.id, reactivoId));
  }

  /**
   * Sync: When a reactivo changes state via Kanban, update the associated ticket's state.
   */
  private async syncTicketState(reactivoId: string, newState: string): Promise<void> {
    try {
      const ticketResult = await this.db
        .select({ id: tickets.id, estado: tickets.estado })
        .from(tickets)
        .where(eq(tickets.reactivoId, reactivoId))
        .limit(1);

      const ticket = ticketResult[0];
      if (!ticket) return;

      // Only sync if states differ
      if (ticket.estado !== newState) {
        await this.db
          .update(tickets)
          .set({ estado: newState, updatedAt: new Date() })
          .where(eq(tickets.id, ticket.id));

        console.log(
          `[Kanban] Ticket ${ticket.id} synced to state '${newState}' from reactivo ${reactivoId}`,
        );
      }
    } catch (error) {
      // Non-critical: log and continue
      console.error(
        `[Kanban] Error syncing ticket state for reactivo ${reactivoId}:`,
        error,
      );
    }
  }

  /**
   * Get full detail of a reactivo including observations with read status and attempt chain.
   * Delegates to ReactivoService.getById() for base detail.
   */
  async getDetail(reactivoId: string) {
    // Get base detail from ReactivoService
    const detail = await this.reactivoService.getById(reactivoId);

    // Get observations with read status
    const observationResults = await this.db
      .select({
        id: observations.id,
        reactivoId: observations.reactivoId,
        authorId: observations.authorId,
        content: observations.content,
        isRead: observations.isRead,
        readAt: observations.readAt,
        createdAt: observations.createdAt,
      })
      .from(observations)
      .where(eq(observations.reactivoId, reactivoId));

    const observationList = observationResults.map((o) => ({
      id: o.id,
      reactivoId: o.reactivoId,
      authorId: o.authorId,
      content: o.content,
      isRead: o.isRead,
      readAt: o.readAt ? o.readAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
    }));

    // Get attempt chain
    const attemptChain = await this.reactivoService.getAttemptChain(reactivoId);

    return {
      ...detail,
      observations: observationList,
      attemptChain,
    };
  }
}
