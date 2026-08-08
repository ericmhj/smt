import { eq, and, desc, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos, stateTransitions } from '../../db/schema/reactivos.js';
import { forms, formVersions, formAssignments } from '../../db/schema/forms.js';
import { tickets } from '../../db/schema/tickets.js';
import { users } from '../../db/schema/users.js';
import { ReactivoError, ReactivoErrorCode } from './reactivo.errors.js';
import { validateResponses } from './schema-validator.js';
import { validate } from '../validation/validation-engine.js';
import type { FormField } from '../validation/validation-engine.js';
import type {
  ReactivoState,
  ReactivoResponse,
  ReactivoDetailResponse,
  StateTransitionResponse,
  ReactivoFilters,
  PaginatedResult,
} from './reactivo.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

function toReactivoResponse(row: {
  id: string;
  formId: string;
  formVersionId: string;
  tecnicoId: string;
  parentReactivoId: string | null;
  attemptNumber: number;
  state: string;
  responses: unknown;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  formName?: string;
}): ReactivoResponse {
  return {
    id: row.id,
    formId: row.formId,
    formVersionId: row.formVersionId,
    tecnicoId: row.tecnicoId,
    parentReactivoId: row.parentReactivoId,
    attemptNumber: row.attemptNumber,
    state: row.state as ReactivoState,
    responses: row.responses as Record<string, unknown>,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    formName: row.formName,
  };
}

export class ReactivoService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new reactivo (first attempt).
   * Validates that the technician has the form assigned and responses match the schema.
   */
  async create(
    formId: string,
    responses: Record<string, unknown>,
    actor: JWTPayload,
  ): Promise<ReactivoResponse> {
    // Validate technician has the form assigned (active assignment)
    const assignmentResult = await this.db
      .select()
      .from(formAssignments)
      .where(
        and(
          eq(formAssignments.formId, formId),
          eq(formAssignments.tecnicoId, actor.sub),
          eq(formAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (assignmentResult.length === 0) {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.FORM_NOT_ASSIGNED,
        'No tienes este formulario asignado',
      );
    }

    // Get current form and version
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.FORM_NOT_FOUND,
        'Formulario no encontrado',
      );
    }

    // Get current form version with JSON schema
    const versionResult = await this.db
      .select()
      .from(formVersions)
      .where(
        and(
          eq(formVersions.formId, formId),
          eq(formVersions.versionNumber, form.currentVersion),
        ),
      )
      .limit(1);

    const version = versionResult[0];
    if (!version) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.VERSION_NOT_FOUND,
        'Versión del formulario no encontrada',
      );
    }

    // Validate responses against JSON schema
    const validation = validateResponses(responses, version.jsonSchema);
    if (!validation.valid) {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.INVALID_RESPONSES,
        `Respuestas inválidas: ${validation.errors.join(', ')}`,
      );
    }

    // Create reactivo with state='pendiente', attempt_number=1
    const result = await this.db
      .insert(reactivos)
      .values({
        formId,
        formVersionId: version.id,
        tecnicoId: actor.sub,
        attemptNumber: 1,
        state: 'pendiente',
        responses,
      })
      .returning();

    const reactivo = result[0]!;

    return toReactivoResponse(reactivo);
  }

  /**
   * Re-apply after rejection. Creates a new reactivo linked to the parent.
   */
  async reapply(
    parentReactivoId: string,
    responses: Record<string, unknown>,
    actor: JWTPayload,
  ): Promise<ReactivoResponse> {
    // Find parent reactivo
    const parentResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, parentReactivoId))
      .limit(1);

    const parent = parentResult[0];
    if (!parent) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo padre no encontrado',
      );
    }

    // Validate parent is in state 'rechazado'
    if (parent.state !== 'rechazado') {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.PARENT_NOT_REJECTED,
        'Solo se puede re-aplicar un reactivo rechazado',
      );
    }

    // Validate actor is the same technician who created the parent
    if (parent.tecnicoId !== actor.sub) {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.NOT_OWNER,
        'Solo el técnico que creó el reactivo puede re-aplicar',
      );
    }

    // Validate form is still assigned to technician
    const assignmentResult = await this.db
      .select()
      .from(formAssignments)
      .where(
        and(
          eq(formAssignments.formId, parent.formId),
          eq(formAssignments.tecnicoId, actor.sub),
          eq(formAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (assignmentResult.length === 0) {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.FORM_NOT_ASSIGNED,
        'Ya no tienes este formulario asignado',
      );
    }

    // Get form version schema and validate responses
    const versionResult = await this.db
      .select()
      .from(formVersions)
      .where(eq(formVersions.id, parent.formVersionId))
      .limit(1);

    const version = versionResult[0];
    if (!version) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.VERSION_NOT_FOUND,
        'Versión del formulario no encontrada',
      );
    }

    const validation = validateResponses(responses, version.jsonSchema);
    if (!validation.valid) {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.INVALID_RESPONSES,
        `Respuestas inválidas: ${validation.errors.join(', ')}`,
      );
    }

    // Create new reactivo linked to parent
    const result = await this.db
      .insert(reactivos)
      .values({
        formId: parent.formId,
        formVersionId: parent.formVersionId,
        tecnicoId: actor.sub,
        parentReactivoId,
        attemptNumber: parent.attemptNumber + 1,
        state: 'pendiente',
        responses,
      })
      .returning();

    const reactivo = result[0]!;

    return toReactivoResponse(reactivo);
  }

  /**
   * Submit the ensayo form for a reactivo in state 'pendiente'.
   * Validates role, ownership, state, schema, persists responses,
   * transitions state to 'en_revision', and syncs ticket.
   */
  async submit(
    reactivoId: string,
    responses: Record<string, unknown>,
    actor: JWTPayload,
  ): Promise<ReactivoResponse> {
    // 1. Verify that actor has role 'tecnico'
    if (actor.role !== 'tecnico') {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.UNAUTHORIZED_ROLE,
        'Solo el técnico puede enviar ensayos',
      );
    }

    // 2. Get reactivo by id
    const reactivoResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    // 3. Verify ownership
    if (reactivo.tecnicoId !== actor.sub) {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.NOT_OWNER,
        'Solo el técnico asignado puede enviar este ensayo',
      );
    }

    // 4. Verify state is 'pendiente'
    if (reactivo.state !== 'pendiente') {
      throw new ReactivoError(
        403,
        ReactivoErrorCode.INVALID_STATE_FOR_SUBMIT,
        'El ensayo no es editable en su estado actual',
      );
    }

    // 5. Get form_version by reactivo.formVersionId
    const versionResult = await this.db
      .select()
      .from(formVersions)
      .where(eq(formVersions.id, reactivo.formVersionId))
      .limit(1);

    const version = versionResult[0];
    if (!version) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.VERSION_NOT_FOUND,
        'Versión del formulario no encontrada',
      );
    }

    // 6. Validate responses against JSON schema
    const validation = validateResponses(responses, version.jsonSchema);
    if (!validation.valid) {
      throw new ReactivoError(
        400,
        ReactivoErrorCode.INVALID_RESPONSES,
        `Respuestas inválidas: ${validation.errors.join(', ')}`,
      );
    }

    // 6b. Validate responses against configured validation rules (if not a legacy form)
    // Legacy forms (no template_id or form_type === 'legacy') skip rules validation (H(s)=1)
    const formResult = await this.db
      .select({ formType: forms.formType, templateId: forms.templateId })
      .from(forms)
      .where(eq(forms.id, reactivo.formId))
      .limit(1);

    const form = formResult[0];
    const isLegacy = !form || !form.templateId || form.formType === 'legacy';

    if (!isLegacy) {
      const fieldsMetadata = (
        version.fieldsMetadata as { sections: Array<{ sectionName: string; fields: string[] }> }
      )?.sections || [];

      const validationResult = await validate(
        this.db,
        reactivo.formId,
        form.formType || 'legacy',
        responses,
        fieldsMetadata as FormField[],
      );

      if (!validationResult.valid) {
        throw new ReactivoError(
          422,
          ReactivoErrorCode.VALIDATION_RULES_FAILED,
          'La validación del formulario falló',
          validationResult.errors,
        );
      }
    }

    // 6c. Compute calculations (if not legacy form)
    if (!isLegacy) {
      try {
        const { compute } = await import('../calculation/calculation-engine.js');
        const calcResult = await compute(this.db, reactivo.formId, form.formType || 'legacy', responses);
        if (Object.keys(calcResult.computedValues).length > 0) {
          Object.assign(responses, calcResult.computedValues);
        }
      } catch (err) {
        console.error('[ReactivoService] Calculation engine error (non-blocking):', err);
      }
    }

    // 7. Update reactivo: responses + state='en_revision'
    const updateResult = await this.db
      .update(reactivos)
      .set({
        responses,
        state: 'en_revision',
        updatedAt: new Date(),
      })
      .where(eq(reactivos.id, reactivoId))
      .returning();

    const updatedReactivo = updateResult[0]!;

    // 8. Sync ticket state
    await this.syncTicketState(reactivoId, 'en_revision');

    return toReactivoResponse(updatedReactivo);
  }

  /**
   * Sync ticket state when a reactivo changes state.
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

      if (ticket.estado !== newState) {
        await this.db
          .update(tickets)
          .set({ estado: newState, updatedAt: new Date() })
          .where(eq(tickets.id, ticket.id));
      }
    } catch (error) {
      console.error(
        `[ReactivoService] Error syncing ticket state for reactivo ${reactivoId}:`,
        error,
      );
    }
  }

  /**
   * Get the form version data (sanitizedHtml, jsonSchema, fieldsMetadata) for a reactivo.
   */
  async getFormData(reactivoId: string): Promise<{
    sanitizedHtml: string;
    jsonSchema: unknown;
    fieldsMetadata: unknown;
  }> {
    const reactivoResult = await this.db
      .select({ formVersionId: reactivos.formVersionId })
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const rvResult = reactivoResult[0];
    if (!rvResult) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    const fvResult = await this.db
      .select({
        htmlContent: formVersions.htmlContent,
        jsonSchema: formVersions.jsonSchema,
        fieldsMetadata: formVersions.fieldsMetadata,
      })
      .from(formVersions)
      .where(eq(formVersions.id, rvResult.formVersionId))
      .limit(1);

    const fv = fvResult[0];
    if (!fv) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.VERSION_NOT_FOUND,
        'Versión del formulario no encontrada',
      );
    }

    // Return htmlContent (with original styles) as sanitizedHtml for backward compatibility
    return {
      sanitizedHtml: fv.htmlContent,
      jsonSchema: fv.jsonSchema,
      fieldsMetadata: fv.fieldsMetadata,
    };
  }

  /**
   * Get a reactivo by ID with full detail (form info, technician info, state transitions).
   */
  async getById(id: string): Promise<ReactivoDetailResponse> {
    const result = await this.db
      .select({
        id: reactivos.id,
        formId: reactivos.formId,
        formVersionId: reactivos.formVersionId,
        tecnicoId: reactivos.tecnicoId,
        parentReactivoId: reactivos.parentReactivoId,
        attemptNumber: reactivos.attemptNumber,
        state: reactivos.state,
        responses: reactivos.responses,
        rejectionReason: reactivos.rejectionReason,
        createdAt: reactivos.createdAt,
        updatedAt: reactivos.updatedAt,
        formName: forms.name,
        formSlug: forms.slug,
        tecnicoName: users.name,
        tecnicoEmail: users.email,
      })
      .from(reactivos)
      .innerJoin(forms, eq(reactivos.formId, forms.id))
      .innerJoin(users, eq(reactivos.tecnicoId, users.id))
      .where(eq(reactivos.id, id))
      .limit(1);

    const row = result[0];
    if (!row) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    // Get state transitions
    const transitions = await this.db
      .select()
      .from(stateTransitions)
      .where(eq(stateTransitions.reactivoId, id))
      .orderBy(stateTransitions.createdAt);

    const stateTransitionResponses: StateTransitionResponse[] = transitions.map((t) => ({
      id: t.id,
      reactivoId: t.reactivoId,
      fromState: t.fromState as ReactivoState,
      toState: t.toState as ReactivoState,
      actorId: t.actorId,
      signatureId: t.signatureId,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      id: row.id,
      formId: row.formId,
      formVersionId: row.formVersionId,
      tecnicoId: row.tecnicoId,
      parentReactivoId: row.parentReactivoId,
      attemptNumber: row.attemptNumber,
      state: row.state as ReactivoState,
      responses: row.responses as Record<string, unknown>,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      form: {
        id: row.formId,
        name: row.formName,
        slug: row.formSlug,
      },
      tecnico: {
        id: row.tecnicoId,
        name: row.tecnicoName,
        email: row.tecnicoEmail,
      },
      stateTransitions: stateTransitionResponses,
    };
  }

  /**
   * Get paginated list of reactivos for a technician.
   */
  async getByTecnico(
    tecnicoId: string,
    filters: ReactivoFilters,
  ): Promise<PaginatedResult<ReactivoResponse>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [eq(reactivos.tecnicoId, tecnicoId)];

    if (filters.state) {
      conditions.push(eq(reactivos.state, filters.state));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reactivos)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    // Get paginated results with form name
    const results = await this.db
      .select({
        id: reactivos.id,
        formId: reactivos.formId,
        formVersionId: reactivos.formVersionId,
        tecnicoId: reactivos.tecnicoId,
        parentReactivoId: reactivos.parentReactivoId,
        attemptNumber: reactivos.attemptNumber,
        state: reactivos.state,
        responses: reactivos.responses,
        rejectionReason: reactivos.rejectionReason,
        createdAt: reactivos.createdAt,
        updatedAt: reactivos.updatedAt,
        formName: forms.name,
      })
      .from(reactivos)
      .innerJoin(forms, eq(reactivos.formId, forms.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(reactivos.createdAt));

    return {
      data: results.map((row) => toReactivoResponse(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get the full attempt chain for a reactivo.
   * Walks up the parent chain to find the root, then returns all reactivos ordered by attempt_number.
   */
  async getAttemptChain(reactivoId: string): Promise<ReactivoResponse[]> {
    // First, find the reactivo
    const reactivoResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo) {
      throw new ReactivoError(
        404,
        ReactivoErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    // Walk up the parent chain to find the root
    let rootId = reactivo.id;
    let currentParentId = reactivo.parentReactivoId;

    while (currentParentId) {
      rootId = currentParentId;
      const parentResult = await this.db
        .select({ id: reactivos.id, parentReactivoId: reactivos.parentReactivoId })
        .from(reactivos)
        .where(eq(reactivos.id, currentParentId))
        .limit(1);

      const parent = parentResult[0];
      if (!parent) break;
      currentParentId = parent.parentReactivoId;
    }

    // Now get all reactivos in the chain starting from root
    // We collect them by walking down from root
    const chain: ReactivoResponse[] = [];
    let currentId: string | null = rootId;

    while (currentId) {
      const result = await this.db
        .select()
        .from(reactivos)
        .where(eq(reactivos.id, currentId))
        .limit(1);

      const current = result[0];
      if (!current) break;

      chain.push(toReactivoResponse(current));

      // Find child (reactivo that has this one as parent)
      const childResult = await this.db
        .select({ id: reactivos.id })
        .from(reactivos)
        .where(eq(reactivos.parentReactivoId, currentId))
        .limit(1);

      currentId = childResult[0]?.id ?? null;
    }

    // Sort by attempt_number
    chain.sort((a, b) => a.attemptNumber - b.attemptNumber);

    return chain;
  }
}
