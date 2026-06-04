import { eq, and, or, like, sql, desc, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { forms, formVersions } from '../../db/schema/forms.js';
import { HTMLParser } from './html-parser.js';
import { detectChanges } from './version-diff.js';
import { FormError, FormErrorCode } from './form.errors.js';
import type {
  FormMetadata,
  FormResponse,
  FormVersionResponse,
  FormUpdateResult,
  FormFilters,
  FormField,
  JSONSchema,
} from './form.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim hyphens
}

function toFormResponse(form: {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  currentVersion: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): FormResponse {
  return {
    id: form.id,
    name: form.name,
    slug: form.slug,
    isActive: form.isActive,
    currentVersion: form.currentVersion,
    createdBy: form.createdBy,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

function toFormVersionResponse(version: {
  id: string;
  formId: string;
  versionNumber: number;
  htmlContent: string;
  sanitizedHtml: string;
  jsonSchema: unknown;
  fieldsMetadata: unknown;
  changeType: string;
  createdBy: string;
  createdAt: Date;
}): FormVersionResponse {
  return {
    id: version.id,
    formId: version.formId,
    versionNumber: version.versionNumber,
    htmlContent: version.htmlContent,
    sanitizedHtml: version.sanitizedHtml,
    jsonSchema: version.jsonSchema as JSONSchema,
    fieldsMetadata: version.fieldsMetadata as FormField[],
    changeType: version.changeType,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
  };
}

export class FormService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(
    html: string,
    metadata: FormMetadata,
    actor: JWTPayload,
  ): Promise<{ form: FormResponse; version: FormVersionResponse }> {
    // Sanitize HTML
    const sanitizedHtml = HTMLParser.sanitize(html);

    // Extract fields
    let fields: FormField[];
    try {
      fields = HTMLParser.extractFields(sanitizedHtml);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Duplicate field names')) {
        throw new FormError(
          400,
          FormErrorCode.DUPLICATE_FIELD_NAMES,
          error.message,
        );
      }
      throw error;
    }

    if (fields.length === 0) {
      throw new FormError(
        400,
        FormErrorCode.NO_FIELDS_FOUND,
        'No se encontraron campos en el HTML proporcionado',
      );
    }

    // Generate JSON Schema
    const jsonSchema = HTMLParser.generateSchema(fields);

    // Generate unique slug
    const slug = await this.generateUniqueSlug(metadata.name);

    // Create form record
    const formResult = await this.db
      .insert(forms)
      .values({
        name: metadata.name,
        slug,
        createdBy: actor.sub,
        currentVersion: 1,
      })
      .returning();

    const form = formResult[0]!;

    // Create form_version record (version 1)
    const versionResult = await this.db
      .insert(formVersions)
      .values({
        formId: form.id,
        versionNumber: 1,
        htmlContent: html,
        sanitizedHtml,
        jsonSchema,
        fieldsMetadata: fields,
        changeType: 'initial',
        createdBy: actor.sub,
      })
      .returning();

    const version = versionResult[0]!;

    return {
      form: toFormResponse(form),
      version: toFormVersionResponse(version),
    };
  }

  async update(
    formId: string,
    html: string,
    actor: JWTPayload,
    newName?: string,
  ): Promise<FormUpdateResult> {
    // Get current form
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    // Get current version's fields
    const currentVersionResult = await this.db
      .select()
      .from(formVersions)
      .where(
        and(
          eq(formVersions.formId, formId),
          eq(formVersions.versionNumber, form.currentVersion),
        ),
      )
      .limit(1);

    const currentVersion = currentVersionResult[0];
    if (!currentVersion) {
      throw new FormError(404, FormErrorCode.VERSION_NOT_FOUND, 'Versión actual no encontrada');
    }

    // Sanitize new HTML and extract fields
    const sanitizedHtml = HTMLParser.sanitize(html);

    let newFields: FormField[];
    try {
      newFields = HTMLParser.extractFields(sanitizedHtml);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Duplicate field names')) {
        throw new FormError(
          400,
          FormErrorCode.DUPLICATE_FIELD_NAMES,
          error.message,
        );
      }
      throw error;
    }

    const oldFields = currentVersion.fieldsMetadata as FormField[];

    // Detect changes
    const changes = detectChanges(oldFields, newFields);

    // Update name if provided
    if (newName && newName !== form.name) {
      const newSlug = await this.generateUniqueSlug(newName, formId);
      await this.db
        .update(forms)
        .set({ name: newName, slug: newSlug, updatedAt: new Date() })
        .where(eq(forms.id, formId));
    }

    if (changes.type === 'aesthetic') {
      // Update current version's html_content and sanitized_html
      await this.db
        .update(formVersions)
        .set({
          htmlContent: html,
          sanitizedHtml,
        })
        .where(eq(formVersions.id, currentVersion.id));

      await this.db
        .update(forms)
        .set({ updatedAt: new Date() })
        .where(eq(forms.id, formId));

      // Fetch updated form
      const updatedFormResult = await this.db
        .select()
        .from(forms)
        .where(eq(forms.id, formId))
        .limit(1);

      return {
        type: 'aesthetic',
        form: toFormResponse(updatedFormResult[0]!),
      };
    }

    // Structural change: create new version
    const newVersionNumber = form.currentVersion + 1;
    const jsonSchema = HTMLParser.generateSchema(newFields);

    const newVersionResult = await this.db
      .insert(formVersions)
      .values({
        formId,
        versionNumber: newVersionNumber,
        htmlContent: html,
        sanitizedHtml,
        jsonSchema,
        fieldsMetadata: newFields,
        changeType: 'structural',
        createdBy: actor.sub,
      })
      .returning();

    // Update form's current version
    await this.db
      .update(forms)
      .set({ currentVersion: newVersionNumber, updatedAt: new Date() })
      .where(eq(forms.id, formId));

    // Fetch updated form
    const updatedFormResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    return {
      type: 'structural',
      form: toFormResponse(updatedFormResult[0]!),
      newVersion: toFormVersionResponse(newVersionResult[0]!),
    };
  }

  async activate(formId: string, _actor: JWTPayload): Promise<void> {
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    await this.db
      .update(forms)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(forms.id, formId));
  }

  async deactivate(formId: string, _actor: JWTPayload): Promise<void> {
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    await this.db
      .update(forms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(forms.id, formId));
  }

  async getVersionHistory(formId: string): Promise<FormVersionResponse[]> {
    // Verify form exists
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    if (formResult.length === 0) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    const versions = await this.db
      .select()
      .from(formVersions)
      .where(eq(formVersions.formId, formId))
      .orderBy(formVersions.versionNumber);

    return versions.map(toFormVersionResponse);
  }

  async getSchema(formId: string, version?: number): Promise<JSONSchema> {
    // Verify form exists
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    const targetVersion = version ?? form.currentVersion;

    const versionResult = await this.db
      .select()
      .from(formVersions)
      .where(
        and(
          eq(formVersions.formId, formId),
          eq(formVersions.versionNumber, targetVersion),
        ),
      )
      .limit(1);

    const formVersion = versionResult[0];
    if (!formVersion) {
      throw new FormError(
        404,
        FormErrorCode.VERSION_NOT_FOUND,
        `Versión ${targetVersion} no encontrada`,
      );
    }

    return formVersion.jsonSchema as JSONSchema;
  }

  async findAll(filters: FormFilters): Promise<PaginatedResult<FormResponse>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];

    if (filters.isActive !== undefined) {
      conditions.push(eq(forms.isActive, filters.isActive));
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          like(forms.name, searchPattern),
          like(forms.slug, searchPattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(forms)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    // Get paginated results
    const results = await this.db
      .select()
      .from(forms)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(forms.createdAt));

    return {
      data: results.map(toFormResponse),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(formId: string): Promise<FormResponse & { currentVersionData: FormVersionResponse }> {
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    const form = formResult[0];
    if (!form) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    // Get current version data
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
      throw new FormError(404, FormErrorCode.VERSION_NOT_FOUND, 'Versión actual no encontrada');
    }

    return {
      ...toFormResponse(form),
      currentVersionData: toFormVersionResponse(version),
    };
  }

  private async generateUniqueSlug(name: string, excludeFormId?: string): Promise<string> {
    const baseSlug = toSlug(name);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const conditions: SQL[] = [eq(forms.slug, slug)];
      if (excludeFormId) {
        conditions.push(sql`${forms.id} != ${excludeFormId}`);
      }

      const existing = await this.db
        .select({ id: forms.id })
        .from(forms)
        .where(and(...conditions))
        .limit(1);

      if (existing.length === 0) {
        return slug;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  async delete(formId: string, _actor: JWTPayload): Promise<void> {
    const formResult = await this.db
      .select()
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);

    if (formResult.length === 0) {
      throw new FormError(404, FormErrorCode.FORM_NOT_FOUND, 'Formulario no encontrado');
    }

    // Delete form versions first (FK constraint)
    await this.db.delete(formVersions).where(eq(formVersions.formId, formId));
    // Delete the form
    await this.db.delete(forms).where(eq(forms.id, formId));
  }
}
