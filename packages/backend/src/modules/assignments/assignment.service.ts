import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { forms, formVersions, formAssignments } from '../../db/schema/forms.js';
import { users } from '../../db/schema/users.js';
import { AssignmentError, AssignmentErrorCode } from './assignment.errors.js';
import type {
  AssignmentResponse,
  AssignmentWithFormResponse,
  AssignmentWithTecnicoResponse,
  MyFormResponse,
} from './assignment.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class AssignmentService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async assign(
    formId: string,
    tecnicoId: string,
    actor: JWTPayload,
  ): Promise<AssignmentResponse> {
    // Validate form exists and is active
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new AssignmentError(
        404,
        AssignmentErrorCode.FORM_NOT_FOUND,
        'Formulario no encontrado',
      );
    }

    if (!form.isActive) {
      throw new AssignmentError(
        400,
        AssignmentErrorCode.FORM_INACTIVE,
        'No se puede asignar un formulario inactivo',
      );
    }

    // Validate tecnico exists and has role 'tecnico'
    const tecnicoResult = await this.db
      .select()
      .from(users)
      .where(eq(users.id, tecnicoId))
      .limit(1);

    const tecnico = tecnicoResult[0];
    if (!tecnico) {
      throw new AssignmentError(
        404,
        AssignmentErrorCode.TECNICO_NOT_FOUND,
        'Técnico no encontrado',
      );
    }

    if (tecnico.role !== 'tecnico' && tecnico.role !== 'tecnico_de_campo') {
      throw new AssignmentError(
        400,
        AssignmentErrorCode.TECNICO_INVALID_ROLE,
        'El usuario no tiene el rol de técnico',
      );
    }

    // Check for duplicate active assignment
    const existingAssignment = await this.db
      .select()
      .from(formAssignments)
      .where(
        and(
          eq(formAssignments.formId, formId),
          eq(formAssignments.tecnicoId, tecnicoId),
          eq(formAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (existingAssignment.length > 0) {
      throw new AssignmentError(
        409,
        AssignmentErrorCode.DUPLICATE_ASSIGNMENT,
        'Ya existe una asignación activa para este formulario y técnico',
      );
    }

    // Create assignment
    const result = await this.db
      .insert(formAssignments)
      .values({
        formId,
        tecnicoId,
        assignedBy: actor.sub,
        isActive: true,
      })
      .returning();

    const assignment = result[0]!;

    return {
      id: assignment.id,
      formId: assignment.formId,
      tecnicoId: assignment.tecnicoId,
      assignedBy: assignment.assignedBy,
      isActive: assignment.isActive,
      createdAt: assignment.createdAt.toISOString(),
      revokedAt: assignment.revokedAt?.toISOString() ?? null,
    };
  }

  async revoke(assignmentId: string, _actor: JWTPayload): Promise<void> {
    const assignmentResult = await this.db
      .select()
      .from(formAssignments)
      .where(eq(formAssignments.id, assignmentId))
      .limit(1);

    const assignment = assignmentResult[0];
    if (!assignment) {
      throw new AssignmentError(
        404,
        AssignmentErrorCode.ASSIGNMENT_NOT_FOUND,
        'Asignación no encontrada',
      );
    }

    await this.db
      .update(formAssignments)
      .set({
        isActive: false,
        revokedAt: new Date(),
      })
      .where(eq(formAssignments.id, assignmentId));
  }

  async getByTecnico(tecnicoId: string): Promise<AssignmentWithFormResponse[]> {
    const results = await this.db
      .select({
        id: formAssignments.id,
        formId: formAssignments.formId,
        tecnicoId: formAssignments.tecnicoId,
        assignedBy: formAssignments.assignedBy,
        isActive: formAssignments.isActive,
        createdAt: formAssignments.createdAt,
        revokedAt: formAssignments.revokedAt,
        formName: forms.name,
        formSlug: forms.slug,
        formCurrentVersion: forms.currentVersion,
      })
      .from(formAssignments)
      .innerJoin(forms, eq(formAssignments.formId, forms.id))
      .where(
        and(
          eq(formAssignments.tecnicoId, tecnicoId),
          eq(formAssignments.isActive, true),
          eq(forms.isActive, true),
        ),
      );

    return results.map((row) => ({
      id: row.id,
      formId: row.formId,
      tecnicoId: row.tecnicoId,
      assignedBy: row.assignedBy,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      form: {
        name: row.formName,
        slug: row.formSlug,
        currentVersion: row.formCurrentVersion,
      },
    }));
  }

  async getAllActive(): Promise<AssignmentWithFormAndTecnicoResponse[]> {
    const results = await this.db
      .select({
        id: formAssignments.id,
        formId: formAssignments.formId,
        tecnicoId: formAssignments.tecnicoId,
        assignedBy: formAssignments.assignedBy,
        isActive: formAssignments.isActive,
        createdAt: formAssignments.createdAt,
        revokedAt: formAssignments.revokedAt,
        formName: forms.name,
        formSlug: forms.slug,
        formCurrentVersion: forms.currentVersion,
        tecnicoName: users.name,
        tecnicoEmail: users.email,
      })
      .from(formAssignments)
      .innerJoin(forms, eq(formAssignments.formId, forms.id))
      .innerJoin(users, eq(formAssignments.tecnicoId, users.id))
      .where(eq(formAssignments.isActive, true));

    return results.map((row) => ({
      id: row.id,
      formId: row.formId,
      tecnicoId: row.tecnicoId,
      assignedBy: row.assignedBy,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      form: {
        name: row.formName,
        slug: row.formSlug,
        currentVersion: row.formCurrentVersion,
      },
      tecnico: {
        name: row.tecnicoName,
        email: row.tecnicoEmail,
      },
    }));
  }

  async getByForm(formId: string): Promise<AssignmentWithTecnicoResponse[]> {
    const results = await this.db
      .select({
        id: formAssignments.id,
        formId: formAssignments.formId,
        tecnicoId: formAssignments.tecnicoId,
        assignedBy: formAssignments.assignedBy,
        isActive: formAssignments.isActive,
        createdAt: formAssignments.createdAt,
        revokedAt: formAssignments.revokedAt,
        tecnicoName: users.name,
        tecnicoEmail: users.email,
      })
      .from(formAssignments)
      .innerJoin(users, eq(formAssignments.tecnicoId, users.id))
      .where(
        and(
          eq(formAssignments.formId, formId),
          eq(formAssignments.isActive, true),
        ),
      );

    return results.map((row) => ({
      id: row.id,
      formId: row.formId,
      tecnicoId: row.tecnicoId,
      assignedBy: row.assignedBy,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      tecnico: {
        name: row.tecnicoName,
        email: row.tecnicoEmail,
      },
    }));
  }

  async getMyForms(tecnicoId: string): Promise<MyFormResponse[]> {
    const results = await this.db
      .select({
        assignmentId: formAssignments.id,
        formId: formAssignments.formId,
        createdAt: formAssignments.createdAt,
        formName: forms.name,
        formSlug: forms.slug,
        formCurrentVersion: forms.currentVersion,
        jsonSchema: formVersions.jsonSchema,
      })
      .from(formAssignments)
      .innerJoin(forms, eq(formAssignments.formId, forms.id))
      .innerJoin(
        formVersions,
        and(
          eq(formVersions.formId, forms.id),
          eq(formVersions.versionNumber, forms.currentVersion),
        ),
      )
      .where(
        and(
          eq(formAssignments.tecnicoId, tecnicoId),
          eq(formAssignments.isActive, true),
          eq(forms.isActive, true),
        ),
      );

    return results.map((row) => ({
      id: row.assignmentId,
      formId: row.formId,
      formName: row.formName,
      formSlug: row.formSlug,
      currentVersion: row.formCurrentVersion,
      jsonSchema: row.jsonSchema,
      assignedAt: row.createdAt.toISOString(),
    }));
  }
}
