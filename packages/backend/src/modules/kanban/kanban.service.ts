import { eq, and, sql, gte, lte, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos, stateTransitions } from '../../db/schema/reactivos.js';
import { forms } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { observations } from '../../db/schema/observations.js';
import { validateTransition } from '../reactivos/state-machine.js';
import { ReactivoService } from '../reactivos/reactivo.service.js';
import { KanbanError, KanbanErrorCode } from './kanban.errors.js';
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  KanbanFilters,
  COLUMN_LABELS,
} from './kanban.types.js';
import { COLUMN_LABELS as columnLabels } from './kanban.types.js';
import type { ReactivoState, StateTransitionResponse } from '../reactivos/reactivo.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class KanbanService {
  private db: Database;
  private reactivoService: ReactivoService;

  constructor(db: Database) {
    this.db = db;
    this.reactivoService = new ReactivoService(db);
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
        .map((r): KanbanCard => ({
          id: r.id,
          formName: r.formName,
          tecnicoName: r.tecnicoName,
          attemptNumber: r.attemptNumber,
          state: r.state as ReactivoState,
          createdAt: r.createdAt.toISOString(),
          unreadObservations: r.unreadObservations,
        })),
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
