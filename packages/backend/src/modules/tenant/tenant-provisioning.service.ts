import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'node:crypto';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { applySchemaTemplate } from '../../db/apply-schema-template.js';
import { getRedisClient } from '../../lib/redis.js';
import type { TenantCreatedEvent } from '../kafka/kafka.events.js';
import type { KeycloakAdminClient } from './keycloak-admin-client.js';

const SCHEMA_NAME_REGEX = /^sgr_[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$/;

function generateTenantHashId(slug: string): string {
  const hash = createHash('md5').update(slug).digest('hex');
  const num = parseInt(hash.slice(-4), 16);
  return String(num).slice(-4).padStart(4, '0');
}

export class TenantProvisioningService {
  private db: Database;
  private keycloakAdmin: KeycloakAdminClient | null;

  constructor(db: Database, keycloakAdmin?: KeycloakAdminClient | null) {
    this.db = db;
    this.keycloakAdmin = keycloakAdmin || null;
  }

  async provisionTenant(event: TenantCreatedEvent): Promise<void> {
    const { slug, nombre, admin_email } = event;
    // Sanitize slug for PostgreSQL schema name: replace hyphens with underscores
    const sanitizedSlug = slug.replace(/-/g, '_');
    const schemaName = `sgr_${sanitizedSlug}`;

    // Pre-validate schema name BEFORE any DB operation (prevents orphaned schemas)
    if (!SCHEMA_NAME_REGEX.test(schemaName)) {
      const errorMsg = `[TenantProvisioning] Schema name inválido: '${schemaName}' (slug: '${slug}'). No se ejecutará CREATE SCHEMA.`;
      console.error(JSON.stringify({
        level: 'error',
        service: 'TenantProvisioning',
        step: 'pre-validation',
        slug,
        schemaName,
        message: errorMsg,
      }));
      throw new Error(errorMsg);
    }

    // Check idempotency: if tenant already exists, skip
    const existing = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[TenantProvisioning] Tenant '${slug}' ya existe, omitiendo provisión`);
      return;
    }

    const sql = getSqlClient();

    // Step 0: Create admin user in Keycloak FIRST to get their UUID.
    // This UUID will be used as users.id in the tenant schema, ensuring
    // actor.sub from JWT tokens matches users.id (fixes FK violation on forms).
    let adminUserId = randomUUID(); // fallback if Keycloak unavailable

    if (this.keycloakAdmin) {
      try {
        console.log(`[TenantProvisioning] Creando usuario '${admin_email}' en Keycloak antes de la transacción DB...`);
        const kcUserId = await this.keycloakAdmin.createUser({
          email: admin_email,
          password: 'admin123',
          temporary: false,
          tenantSlug: slug,
          roles: ['admin'],
        });
        if (kcUserId) {
          adminUserId = kcUserId;
          console.log(`[TenantProvisioning] UUID de Keycloak obtenido: ${adminUserId}`);
        } else {
          console.warn(`[TenantProvisioning] Keycloak no retornó UUID para '${admin_email}', usando UUID local`);
        }
      } catch (keycloakError) {
        const kcErrorMsg = keycloakError instanceof Error ? keycloakError.message : 'Error desconocido';
        console.warn(`[TenantProvisioning] Error creando usuario en Keycloak (usando UUID local): ${kcErrorMsg}`);
      }
    } else {
      console.warn(`[TenantProvisioning] KeycloakAdminClient no disponible — usuario '${admin_email}' NO creado en Keycloak`);
    }

    // Wrap ALL provisioning steps in a single transaction for atomicity.
    // If any step fails, the transaction rolls back (including CREATE SCHEMA).
    try {
      await sql.begin(async (tx) => {
        // 1. Create the schema
        await tx.unsafe(`CREATE SCHEMA ${schemaName}`);

        // 2. Apply schema template (creates all tables)
        await applySchemaTemplate(tx, schemaName);

        // 3. Create tenant record in platform.tenants
        const tenantId = randomUUID();
        const hashId = generateTenantHashId(slug);
        await tx`
          INSERT INTO public.tenants (id, hash_id, slug, nombre, status)
          VALUES (${tenantId}, ${hashId}, ${slug}, ${nombre}, 'active')
        `;

        // 4. Create admin user in the tenant schema using the Keycloak UUID.
        // This ensures users.id === actor.sub from JWT, preventing FK violations.
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await tx.unsafe(`SET search_path TO ${schemaName}, public`);
        await tx`
          INSERT INTO users (id, name, email, password_hash, role, is_active)
          VALUES (${adminUserId}, 'Admin', ${admin_email}, ${hashedPassword}, 'admin', true)
          ON CONFLICT (email) DO NOTHING
        `;

        // Reset search_path
        await tx.unsafe(`SET search_path TO public`);
      });

      console.log(`[TenantProvisioning] Tenant '${slug}' provisionado exitosamente (schema: ${schemaName})`);
    } catch (error) {
      // Structured error logging for operator diagnosis
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(JSON.stringify({
        level: 'error',
        service: 'TenantProvisioning',
        step: 'transaction',
        slug,
        schemaName,
        eventType: event.type,
        error: errorMessage,
        message: `[TenantProvisioning] Error provisionando tenant '${slug}': ${errorMessage}`,
      }));

      // Re-throw so caller (Kafka consumer) can handle retry logic
      throw error;
    }
  }

  async suspendTenant(slug: string): Promise<void> {
    await this.db
      .update(tenants)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(tenants.slug, slug));

    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' suspendido`);
  }

  async reactivateTenant(slug: string): Promise<void> {
    await this.db
      .update(tenants)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(tenants.slug, slug));

    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' reactivado`);
  }

  private async invalidateTenantCache(slug: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(`tenant:${slug}`);
    } catch (error) {
      console.error(`[TenantProvisioning] Error invalidando caché para '${slug}':`, error);
    }
  }
}
