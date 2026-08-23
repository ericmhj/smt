import { eq, and, lte } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'node:crypto';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { applySchemaTemplate } from '../../db/apply-schema-template.js';
import { getRedisClient } from '../../lib/redis.js';
import { deleteAllWithPrefix } from '../../lib/minio.js';
import type { KeycloakAdminClient } from '../tenant/keycloak-admin-client.js';
import { toSchemaName } from '../../lib/tenant-schema.js';

function generateTenantHashId(slug: string): string {
  const hash = createHash('md5').update(slug).digest('hex');
  const num = parseInt(hash.slice(-4), 16);
  return String(num).slice(-4).padStart(4, '0');
}

export class TenantLifecycleError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TenantLifecycleError';
  }
}

export interface CreateTenantDTO {
  slug: string;
  nombre: string;
  plan: string;
  adminEmail: string;
  adminPassword: string;
}

export interface TenantRecord {
  id: string;
  slug: string;
  nombre: string;
  plan: string;
  status: string;
  config: unknown;
  scheduledDeletionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export class TenantLifecycleService {
  private db: Database;
  private keycloakAdmin: KeycloakAdminClient | null;

  constructor(db: Database, keycloakAdmin?: KeycloakAdminClient) {
    this.db = db;
    this.keycloakAdmin = keycloakAdmin ?? null;
  }

  /**
   * Validates the tenant slug format.
   * Must be 3-50 chars, lowercase alphanumeric and hyphens, no leading/trailing hyphens.
   */
  private validateSlug(slug: string): void {
    if (!SLUG_REGEX.test(slug)) {
      throw new TenantLifecycleError(
        422,
        'INVALID_TENANT_SLUG',
        `El slug '${slug}' no es válido. Debe contener entre 3-50 caracteres, solo letras minúsculas, números y guiones, sin comenzar ni terminar en guión.`,
      );
    }
  }

  /**
   * Validates that the admin email domain relates to the tenant slug.
   * At least one significant part of the slug (≥3 chars) must appear in the email domain.
   */
  private validateEmailDomain(email: string, slug: string): void {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      throw new TenantLifecycleError(
        422,
        'INVALID_ADMIN_EMAIL',
        `El email '${email}' no tiene un dominio válido.`,
      );
    }

    const slugParts = slug.toLowerCase().replace(/_/g, '-').split('-');
    const domainBase = domain.split('.')[0]!; // "padsa" from "padsa.com"

    const matches = slugParts.some(
      (part) => part.length >= 3 && domainBase.includes(part),
    );

    if (!matches) {
      throw new TenantLifecycleError(
        422,
        'EMAIL_DOMAIN_MISMATCH',
        `El dominio del email '${email}' no coincide con el tenant '${slug}'. El dominio debe contener al menos una parte del slug (ej: admin@${slugParts[0]}.com).`,
      );
    }
  }

  /**
   * Creates a new tenant with full schema provisioning.
   * Atomic: either all artifacts are created or none.
   * Also creates the admin user in Keycloak if KeycloakAdminClient is available.
   */
  async createTenant(dto: CreateTenantDTO): Promise<TenantRecord> {
    this.validateSlug(dto.slug);
    this.validateEmailDomain(dto.adminEmail, dto.slug);

    const sqlClient = getSqlClient();
    const schemaName = toSchemaName(dto.slug);

    // Check for existing tenant with same slug
    const existing = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, dto.slug))
      .limit(1);

    if (existing.length > 0) {
      throw new TenantLifecycleError(409, 'TENANT_SLUG_EXISTS', `El slug '${dto.slug}' ya está en uso`);
    }

    // Step 0: Create admin user in Keycloak FIRST to get their UUID.
    let adminUserId = randomUUID();

    if (this.keycloakAdmin) {
      try {
        console.log(`[TenantLifecycle] Creando usuario '${dto.adminEmail}' en Keycloak...`);
        const kcUserId = await this.keycloakAdmin.createUser({
          email: dto.adminEmail,
          password: dto.adminPassword,
          temporary: false,
          tenantSlug: dto.slug,
          roles: ['admin'],
        });
        if (kcUserId) {
          adminUserId = kcUserId;
          console.log(`[TenantLifecycle] UUID de Keycloak obtenido: ${adminUserId}`);
        } else {
          console.warn(`[TenantLifecycle] Keycloak no retornó UUID para '${dto.adminEmail}', usando UUID local`);
        }
      } catch (keycloakError) {
        const kcMsg = keycloakError instanceof Error ? keycloakError.message : 'Error desconocido';
        console.warn(`[TenantLifecycle] Error creando usuario en Keycloak: ${kcMsg}. Continuando con UUID local.`);
      }
    }

    // Use a transaction for atomicity
    try {
      const result = await sqlClient.begin(async (tx) => {
        // 1. Insert tenant record
        const hashId = generateTenantHashId(dto.slug);
        const [tenantRecord] = await tx`
          INSERT INTO public.tenants (hash_id, slug, nombre, plan, status)
          VALUES (${hashId}, ${dto.slug}, ${dto.nombre}, ${dto.plan}, 'active')
          RETURNING id, hash_id, slug, nombre, plan, status, config, scheduled_deletion_at, created_at, updated_at
        `;

        // 2. Create schema
        await tx.unsafe(`CREATE SCHEMA ${schemaName}`);

        // 3. Apply schema template (creates all tables)
        await applySchemaTemplate(tx, schemaName);

        // 4. Insert admin user into the new schema with Keycloak UUID
        const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
        await tx.unsafe(`SET search_path TO ${schemaName}, public`);
        await tx`
          INSERT INTO users (id, email, password_hash, name, role, is_active)
          VALUES (${adminUserId}, ${dto.adminEmail}, ${passwordHash}, 'Administrador', 'admin', true)
        `;

        // Reset search_path
        await tx.unsafe(`SET search_path TO public`);

        return tenantRecord;
      });

      return {
        id: result.id,
        slug: result.slug,
        nombre: result.nombre,
        plan: result.plan,
        status: result.status,
        config: result.config,
        scheduledDeletionAt: result.scheduled_deletion_at,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      };
    } catch (error) {
      // If it's already a TenantLifecycleError, re-throw
      if (error instanceof TenantLifecycleError) {
        throw error;
      }

      // Attempt cleanup in case of partial failure
      try {
        await sqlClient.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      } catch {
        // Cleanup failure is non-critical at this point
      }

      const message = error instanceof Error ? error.message : 'Error desconocido';
      throw new TenantLifecycleError(
        500,
        'TENANT_CREATION_FAILED',
        `Error al crear el tenant: ${message}`,
      );
    }
  }

  /**
   * Suspends an active tenant.
   */
  async suspendTenant(tenantId: string): Promise<TenantRecord> {
    const tenant = await this.findTenantById(tenantId);

    if (tenant.status !== 'active') {
      throw new TenantLifecycleError(
        409,
        'INVALID_TENANT_STATE',
        `No se puede suspender un tenant con estado '${tenant.status}'. Solo se pueden suspender tenants activos.`,
      );
    }

    const [updated] = await this.db
      .update(tenants)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    // Invalidate Redis cache
    await this.invalidateCache(tenant.slug);

    return this.mapTenantRecord(updated!);
  }

  /**
   * Reactivates a suspended or pending_deletion tenant.
   */
  async activateTenant(tenantId: string): Promise<TenantRecord> {
    const tenant = await this.findTenantById(tenantId);

    if (tenant.status !== 'suspended' && tenant.status !== 'pending_deletion') {
      throw new TenantLifecycleError(
        409,
        'INVALID_TENANT_STATE',
        `No se puede reactivar un tenant con estado '${tenant.status}'. Solo se pueden reactivar tenants suspendidos o pendientes de eliminación.`,
      );
    }

    const [updated] = await this.db
      .update(tenants)
      .set({
        status: 'active',
        scheduledDeletionAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    // Invalidate Redis cache
    await this.invalidateCache(tenant.slug);

    return this.mapTenantRecord(updated!);
  }

  /**
   * Schedules a tenant for deletion with a 30-day grace period.
   */
  async scheduleDeletion(tenantId: string): Promise<TenantRecord> {
    const tenant = await this.findTenantById(tenantId);

    if (tenant.status !== 'active') {
      throw new TenantLifecycleError(
        409,
        'INVALID_TENANT_STATE',
        `No se puede programar la eliminación de un tenant con estado '${tenant.status}'. Solo se pueden eliminar tenants activos.`,
      );
    }

    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);

    const [updated] = await this.db
      .update(tenants)
      .set({
        status: 'pending_deletion',
        scheduledDeletionAt,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    // Invalidate Redis cache
    await this.invalidateCache(tenant.slug);

    return this.mapTenantRecord(updated!);
  }

  /**
   * Executes pending deletions for tenants whose grace period has expired.
   */
  async executePendingDeletions(): Promise<void> {
    const now = new Date();

    const pendingTenants = await this.db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.status, 'pending_deletion'),
          lte(tenants.scheduledDeletionAt, now),
        ),
      );

    const sqlClient = getSqlClient();

    for (const tenant of pendingTenants) {
      try {
        const schemaName = toSchemaName(tenant.slug);

        // Drop the schema
        await sqlClient.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);

        // Delete Redis keys matching tenant pattern
        await this.deleteRedisKeysForTenant(tenant.slug);

        // Delete S3 objects with tenant prefix
        await deleteAllWithPrefix(`${tenant.slug}/`);

        // Delete tenant record
        await this.db.delete(tenants).where(eq(tenants.id, tenant.id));
      } catch (error) {
        // Log error but continue with other tenants
        console.error(`Error executing deletion for tenant ${tenant.slug}:`, error);
      }
    }
  }

  private async findTenantById(tenantId: string) {
    const result = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (result.length === 0) {
      throw new TenantLifecycleError(404, 'TENANT_NOT_FOUND', 'Tenant no encontrado');
    }

    return result[0]!;
  }

  private async invalidateCache(slug: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(`tenant:${slug}`);
    } catch {
      // Cache invalidation failure is non-critical
    }
  }

  private async deleteRedisKeysForTenant(slug: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const pattern = `${slug}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      // Also delete the tenant status cache key
      await redis.del(`tenant:${slug}`);
    } catch {
      // Redis cleanup failure is non-critical
    }
  }

  private mapTenantRecord(raw: typeof tenants.$inferSelect): TenantRecord {
    return {
      id: raw.id,
      slug: raw.slug,
      nombre: raw.nombre,
      plan: raw.plan,
      status: raw.status,
      config: raw.config,
      scheduledDeletionAt: raw.scheduledDeletionAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
