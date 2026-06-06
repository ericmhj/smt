import { eq, and, sql, gte, lte, count } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import {
  clientes,
  clienteContactos,
  clienteDocumentos,
} from '../../db/schema/clientes.js';
import { tickets } from '../../db/schema/tickets.js';
import { ClienteError, ClienteErrorCode } from './cliente.errors.js';
import type {
  CreateClienteDTO,
  UpdateClienteDTO,
  ClienteResponse,
  ClienteDetalle,
  ClienteFilters,
  Pagination,
  PaginatedResult,
  CreateContactoDTO,
  UpdateContactoDTO,
  ContactoResponse,
} from './cliente.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class ClienteService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // ─── CRUD de Clientes ───────────────────────────────────────────────────────

  async create(data: CreateClienteDTO, _actor: JWTPayload): Promise<ClienteResponse> {
    // Validate email uniqueness
    await this.assertEmailUnique(data.email);

    // Validate phone uniqueness
    if (data.telefono) {
      await this.assertPhoneUnique(data.telefono);
    }

    // Normalize tags
    const etiquetas = this.normalizeTags(data.etiquetas);

    const result = await this.db
      .insert(clientes)
      .values({
        nombre: data.nombre,
        empresa: data.empresa ?? null,
        email: data.email,
        telefono: data.telefono ?? null,
        direccion: data.direccion ?? null,
        industria: data.industria ?? null,
        etiquetas,
      })
      .returning();

    const cliente = result[0]!;
    return this.toClienteResponse(cliente);
  }

  async update(
    id: string,
    data: UpdateClienteDTO,
    _actor: JWTPayload,
  ): Promise<ClienteResponse> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    // Validate email uniqueness if changed
    if (data.email && data.email !== existing.email) {
      await this.assertEmailUnique(data.email);
    }

    // Validate phone uniqueness if changed
    if (data.telefono && data.telefono !== existing.telefono) {
      await this.assertPhoneUnique(data.telefono);
    }

    // Build update values
    const updateValues: Record<string, unknown> = {};
    if (data.nombre !== undefined) updateValues.nombre = data.nombre;
    if (data.empresa !== undefined) updateValues.empresa = data.empresa;
    if (data.email !== undefined) updateValues.email = data.email;
    if (data.telefono !== undefined) updateValues.telefono = data.telefono;
    if (data.direccion !== undefined) updateValues.direccion = data.direccion;
    if (data.industria !== undefined) updateValues.industria = data.industria;
    if (data.etiquetas !== undefined) {
      updateValues.etiquetas = this.normalizeTags(data.etiquetas);
    }
    updateValues.updatedAt = new Date();

    const result = await this.db
      .update(clientes)
      .set(updateValues)
      .where(eq(clientes.id, id))
      .returning();

    return this.toClienteResponse(result[0]!);
  }

  async getById(id: string): Promise<ClienteDetalle | null> {
    const clienteResult = await this.db
      .select()
      .from(clientes)
      .where(eq(clientes.id, id))
      .limit(1);

    const cliente = clienteResult[0];
    if (!cliente) return null;

    // Fetch contacts
    const contactos = await this.db
      .select()
      .from(clienteContactos)
      .where(eq(clienteContactos.clienteId, id));

    // Fetch documents summary
    const documentos = await this.db
      .select({
        id: clienteDocumentos.id,
        originalName: clienteDocumentos.originalName,
        mimeType: clienteDocumentos.mimeType,
        sizeBytes: clienteDocumentos.sizeBytes,
        createdAt: clienteDocumentos.createdAt,
      })
      .from(clienteDocumentos)
      .where(eq(clienteDocumentos.clienteId, id));

    // Fetch tickets summary
    const ticketsList = await this.db
      .select({
        id: tickets.id,
        estado: tickets.estado,
        prioridad: tickets.prioridad,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(eq(tickets.clienteId, id));

    return {
      ...this.toClienteResponse(cliente),
      contactos: contactos.map((c) => this.toContactoResponse(c)),
      documentos: documentos.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt.toISOString(),
      })),
      tickets: ticketsList.map((t) => ({
        id: t.id,
        estado: t.estado,
        prioridad: t.prioridad,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async list(
    filters: ClienteFilters,
    pagination: Pagination,
  ): Promise<PaginatedResult<ClienteResponse>> {
    const conditions = this.buildFilterConditions(filters);

    // Count total
    const countResult = await this.db
      .select({ total: count() })
      .from(clientes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.total ?? 0;

    // Fetch paginated results
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = await this.db
      .select()
      .from(clientes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(pagination.pageSize)
      .offset(offset)
      .orderBy(clientes.createdAt);

    return {
      data: rows.map((r) => this.toClienteResponse(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  // ─── Etiquetas ──────────────────────────────────────────────────────────────

  async addTag(
    clienteId: string,
    tag: string,
    _actor: JWTPayload,
  ): Promise<string[]> {
    const normalizedTag = this.normalizeTag(tag);
    if (!normalizedTag) {
      throw new ClienteError(
        400,
        ClienteErrorCode.INVALID_TAG,
        'La etiqueta no puede estar vacía',
      );
    }

    const cliente = await this.findById(clienteId);
    if (!cliente) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    const currentTags: string[] = (cliente.etiquetas as string[]) ?? [];
    if (currentTags.includes(normalizedTag)) {
      return currentTags;
    }

    const updatedTags = [...currentTags, normalizedTag];

    await this.db
      .update(clientes)
      .set({ etiquetas: updatedTags, updatedAt: new Date() })
      .where(eq(clientes.id, clienteId));

    return updatedTags;
  }

  async removeTag(
    clienteId: string,
    tag: string,
    _actor: JWTPayload,
  ): Promise<string[]> {
    const normalizedTag = this.normalizeTag(tag);

    const cliente = await this.findById(clienteId);
    if (!cliente) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    const currentTags: string[] = (cliente.etiquetas as string[]) ?? [];
    const updatedTags = currentTags.filter((t) => t !== normalizedTag);

    await this.db
      .update(clientes)
      .set({ etiquetas: updatedTags, updatedAt: new Date() })
      .where(eq(clientes.id, clienteId));

    return updatedTags;
  }

  // ─── Desactivación ──────────────────────────────────────────────────────────

  async deactivate(id: string, _actor: JWTPayload): Promise<void> {
    const cliente = await this.findById(id);
    if (!cliente) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    await this.db
      .update(clientes)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(clientes.id, id));
  }

  // ─── Contactos ──────────────────────────────────────────────────────────────

  async addContacto(
    clienteId: string,
    data: CreateContactoDTO,
    _actor: JWTPayload,
  ): Promise<ContactoResponse> {
    // Verify client exists
    const cliente = await this.findById(clienteId);
    if (!cliente) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    // If this contact is principal, unset others
    if (data.esPrincipal) {
      await this.db
        .update(clienteContactos)
        .set({ esPrincipal: false, updatedAt: new Date() })
        .where(eq(clienteContactos.clienteId, clienteId));
    }

    const result = await this.db
      .insert(clienteContactos)
      .values({
        clienteId,
        nombre: data.nombre,
        email: data.email ?? null,
        telefono: data.telefono ?? null,
        cargo: data.cargo ?? null,
        esPrincipal: data.esPrincipal ?? false,
      })
      .returning();

    return this.toContactoResponse(result[0]!);
  }

  async updateContacto(
    contactoId: string,
    data: UpdateContactoDTO,
    _actor: JWTPayload,
  ): Promise<ContactoResponse> {
    // Verify contact exists
    const existing = await this.db
      .select()
      .from(clienteContactos)
      .where(eq(clienteContactos.id, contactoId))
      .limit(1);

    if (existing.length === 0) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Contacto no encontrado');
    }

    const contacto = existing[0]!;

    // If setting as principal, unset others for same client
    if (data.esPrincipal) {
      await this.db
        .update(clienteContactos)
        .set({ esPrincipal: false, updatedAt: new Date() })
        .where(eq(clienteContactos.clienteId, contacto.clienteId));
    }

    const updateValues: Record<string, unknown> = {};
    if (data.nombre !== undefined) updateValues.nombre = data.nombre;
    if (data.email !== undefined) updateValues.email = data.email;
    if (data.telefono !== undefined) updateValues.telefono = data.telefono;
    if (data.cargo !== undefined) updateValues.cargo = data.cargo;
    if (data.esPrincipal !== undefined) updateValues.esPrincipal = data.esPrincipal;
    updateValues.updatedAt = new Date();

    const result = await this.db
      .update(clienteContactos)
      .set(updateValues)
      .where(eq(clienteContactos.id, contactoId))
      .returning();

    return this.toContactoResponse(result[0]!);
  }

  async removeContacto(contactoId: string, _actor: JWTPayload): Promise<void> {
    const existing = await this.db
      .select()
      .from(clienteContactos)
      .where(eq(clienteContactos.id, contactoId))
      .limit(1);

    if (existing.length === 0) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Contacto no encontrado');
    }

    await this.db
      .delete(clienteContactos)
      .where(eq(clienteContactos.id, contactoId));
  }

  async getContactos(clienteId: string): Promise<ContactoResponse[]> {
    const cliente = await this.findById(clienteId);
    if (!cliente) {
      throw new ClienteError(404, ClienteErrorCode.NOT_FOUND, 'Cliente no encontrado');
    }

    const contactos = await this.db
      .select()
      .from(clienteContactos)
      .where(eq(clienteContactos.clienteId, clienteId));

    return contactos.map((c) => this.toContactoResponse(c));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async findById(id: string) {
    const result = await this.db
      .select()
      .from(clientes)
      .where(eq(clientes.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  private async assertEmailUnique(email: string, excludeId?: string): Promise<void> {
    const conditions = [eq(clientes.email, email)];
    if (excludeId) {
      conditions.push(sql`${clientes.id} != ${excludeId}`);
    }

    const existing = await this.db
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ClienteError(
        409,
        ClienteErrorCode.EMAIL_EXISTS,
        'Ya existe un cliente con este email',
      );
    }
  }

  private async assertPhoneUnique(telefono: string, excludeId?: string): Promise<void> {
    const conditions = [eq(clientes.telefono, telefono)];
    if (excludeId) {
      conditions.push(sql`${clientes.id} != ${excludeId}`);
    }

    const existing = await this.db
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      throw new ClienteError(
        409,
        ClienteErrorCode.PHONE_EXISTS,
        'Ya existe un cliente con este teléfono',
      );
    }
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    return tags.map((tag) => this.normalizeTag(tag)).filter(Boolean) as string[];
  }

  private normalizeTag(tag: string): string {
    return tag.trim().toLowerCase();
  }

  private buildFilterConditions(filters: ClienteFilters) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.industria) {
      conditions.push(eq(clientes.industria, filters.industria));
    }

    if (filters.etiquetas && filters.etiquetas.length > 0) {
      // Tag intersection: client must have ALL specified tags
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

  private toContactoResponse(
    row: typeof clienteContactos.$inferSelect,
  ): ContactoResponse {
    return {
      id: row.id,
      clienteId: row.clienteId,
      nombre: row.nombre,
      email: row.email,
      telefono: row.telefono,
      cargo: row.cargo,
      esPrincipal: row.esPrincipal,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
