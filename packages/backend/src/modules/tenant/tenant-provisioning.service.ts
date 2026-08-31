import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'node:crypto';
import type { Database } from '../../db/index.js';
import { getSqlClient } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { applySchemaTemplate } from '../../db/apply-schema-template.js';
import { getRedisClient } from '../../lib/redis.js';
import type { TenantCreatedEvent } from '../kafka/kafka.events.js';
import type { KeycloakAdminClient } from './keycloak-admin-client.js';
import { toSchemaName } from '../../lib/tenant-schema.js';

function generateTenantHashId(slug: string): string {
  const hash = createHash('md5').update(slug).digest('hex');
  const num = parseInt(hash.slice(-4), 16);
  return String(num).slice(-4).padStart(4, '0');
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

type TenantStatus = 'onboarding' | 'active' | 'suspended' | 'cancelled' | 'pending_deletion';

/**
 * Mapea el estado del tenant en license-service (fuente de verdad) al status de SMT.
 */
function mapEstadoToStatus(estado: string | undefined): TenantStatus | undefined {
  if (!estado) return undefined;
  switch (estado.toUpperCase()) {
    case 'ONBOARDING':
      return 'onboarding';
    case 'ACTIVE':
      return 'active';
    case 'SUSPENDED':
      return 'suspended';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return undefined;
  }
}

/**
 * Plan por defecto cuando el evento no trae plan_codigo (p.ej. onboarding temprano).
 */
const DEFAULT_PLAN = 'starter';

export class TenantProvisioningService {
  private db: Database;
  private keycloakAdmin: KeycloakAdminClient | null;

  constructor(db: Database, keycloakAdmin?: KeycloakAdminClient | null) {
    this.db = db;
    this.keycloakAdmin = keycloakAdmin || null;
  }

  async provisionTenant(
    event: TenantCreatedEvent,
    options: { status?: 'onboarding' | 'active' } = {},
  ): Promise<void> {
    const { slug, nombre, admin_email } = event;
    const licenseTenantId = event.tenant_id;
    // El estado de la fuente de verdad manda; si no viene, cae al hint del caller.
    const status: TenantStatus = mapEstadoToStatus(event.estado) ?? options.status ?? 'onboarding';
    const plan = event.plan_codigo || DEFAULT_PLAN;
    const config = event.config ?? {};

    // El tenant_id de license-service (fuente de verdad) es OBLIGATORIO:
    // se usa como PK de public.tenants para correlacionar ambos sistemas.
    // Si no viene un UUID válido, rechazamos el evento en vez de inventar un id.
    if (!isValidUuid(licenseTenantId)) {
      throw new Error(
        `[TenantProvisioning] Evento rechazado: tenant_id inválido o ausente ('${licenseTenantId}') para slug '${slug}'. ` +
          `Se requiere el UUID del tenant de license-service para la correlación cross-service.`,
      );
    }

    const schemaName = toSchemaName(slug);

    // Idempotencia: por license_tenant_id (correlación con la fuente de verdad).
    // El mismo tenant de license-service no debe provisionarse dos veces aunque
    // cambie el slug. También cubrimos el caso de existentes por slug.
    const existing = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(or(eq(tenants.licenseTenantId, licenseTenantId), eq(tenants.slug, slug)))
      .limit(1);

    if (existing.length > 0) {
      // Ya existe (por correlación o por slug). No re-provisionamos el schema,
      // pero SÍ reconciliamos las columnas espejo desde la fuente de verdad:
      // completamos la correlación si falta y refrescamos nombre/plan/status/config.
      const sqlReconcile = getSqlClient();
      await sqlReconcile`
        UPDATE public.tenants
        SET license_tenant_id = COALESCE(license_tenant_id, ${licenseTenantId}),
            nombre = ${nombre},
            plan = ${plan},
            status = ${status},
            config = ${sqlReconcile.json(config)},
            updated_at = NOW()
        WHERE slug = ${slug}
      `;

      console.log(
        `[TenantProvisioning] Tenant '${slug}' (license_tenant_id: ${licenseTenantId}) ya existe, columnas reconciliadas`,
      );
      return;
    }

    const sql = getSqlClient();

    // Step 0: Create admin user in Keycloak FIRST to get their UUID.
    // This UUID will be used as users.id in the tenant schema, ensuring
    // actor.sub from JWT tokens matches users.id (fixes FK violation on forms).
    let adminUserId: string = randomUUID(); // fallback if Keycloak unavailable

    if (this.keycloakAdmin) {
      try {
        console.log(`[TenantProvisioning] Creando usuario '${admin_email}' en Keycloak antes de la transacción DB...`);
        const kcUserId = await this.keycloakAdmin.createUser({
          email: admin_email,
          password: admin_email, // Temporary password = email; user must change on first login
          temporary: true,
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

        // 3. Create tenant record in platform.tenants.
        // El id local se genera; license_tenant_id guarda el UUID de
        // license-service (fuente de verdad) como clave de correlación.
        // plan/status/config se pueblan desde el evento (fuente de verdad).
        const tenantId = randomUUID();
        const hashId = generateTenantHashId(slug);
        await tx`
          INSERT INTO public.tenants (id, license_tenant_id, hash_id, slug, nombre, plan, status, config)
          VALUES (${tenantId}, ${licenseTenantId}, ${hashId}, ${slug}, ${nombre}, ${plan}, ${status}, ${tx.json(config)})
        `;

        // 4. Create admin user in the tenant schema using the Keycloak UUID.
        // This ensures users.id === actor.sub from JWT, preventing FK violations.
        const hashedPassword = await bcrypt.hash(randomUUID().slice(0, 16), 10); // Random password; login via Keycloak
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

  /**
   * Marca un tenant ya provisionado como 'active'.
   * Se invoca al recibir tenant.activated desde license-service.
   * Idempotente: si el tenant no existe aún, delega en provisionTenant (active).
   */
  async activateTenant(event: TenantCreatedEvent): Promise<void> {
    const { slug } = event;
    const licenseTenantId = event.tenant_id;

    if (isValidUuid(licenseTenantId)) {
      const existing = await this.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(or(eq(tenants.licenseTenantId, licenseTenantId), eq(tenants.slug, slug)))
        .limit(1);

      if (existing.length === 0) {
        // Aún no se provisionó (p.ej. se perdió tenant.onboarded): provisionar ya activo.
        await this.provisionTenant(event, { status: 'active' });
        return;
      }
    }

    // Refresca columnas espejo (plan/nombre/config pudieron cambiar) y marca active.
    await this.reconcileFromEvent(event, 'active');
    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' activado`);
  }

  /**
   * Aplica un evento tenant.updated: refresca nombre/plan/config (y status si viene)
   * desde la fuente de verdad. NUNCA toca slug ni id. Idempotente.
   * Si el tenant no existe aún, lo provisiona.
   */
  async updateTenant(event: TenantCreatedEvent): Promise<void> {
    const { slug } = event;
    const licenseTenantId = event.tenant_id;

    if (isValidUuid(licenseTenantId)) {
      const existing = await this.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(or(eq(tenants.licenseTenantId, licenseTenantId), eq(tenants.slug, slug)))
        .limit(1);

      if (existing.length === 0) {
        await this.provisionTenant(event);
        return;
      }
    }

    await this.reconcileFromEvent(event);
    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' actualizado`);
  }

  async suspendTenant(slug: string): Promise<void> {
    await this.setTenantStatus(slug, 'suspended');
    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' suspendido`);
  }

  async reactivateTenant(slug: string): Promise<void> {
    await this.setTenantStatus(slug, 'active');
    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' reactivado`);
  }

  async cancelTenant(slug: string): Promise<void> {
    await this.setTenantStatus(slug, 'cancelled');
    await this.invalidateTenantCache(slug);
    console.log(`[TenantProvisioning] Tenant '${slug}' cancelado`);
  }

  /**
   * Actualiza el status de un tenant vía SQL crudo (evita el sistema de tipos
   * de Drizzle, consistente con el INSERT crudo del provisioning).
   */
  private async setTenantStatus(slug: string, status: TenantStatus): Promise<void> {
    const sqlClient = getSqlClient();
    await sqlClient`
      UPDATE public.tenants
      SET status = ${status}, updated_at = NOW()
      WHERE slug = ${slug}
    `;
  }

  /**
   * Reconcilia las columnas espejo (nombre, plan, config, y opcionalmente status)
   * desde un evento de la fuente de verdad. Idempotente. No toca slug ni id.
   * @param forceStatus si se indica, fija ese status; si no, usa event.estado (si viene).
   */
  private async reconcileFromEvent(
    event: TenantCreatedEvent,
    forceStatus?: TenantStatus,
  ): Promise<void> {
    const sqlClient = getSqlClient();
    const nombre = event.nombre;
    const plan = event.plan_codigo || DEFAULT_PLAN;
    const config = event.config ?? {};
    const status = forceStatus ?? mapEstadoToStatus(event.estado);

    if (status) {
      await sqlClient`
        UPDATE public.tenants
        SET nombre = ${nombre},
            plan = ${plan},
            status = ${status},
            config = ${sqlClient.json(config)},
            updated_at = NOW()
        WHERE slug = ${event.slug}
      `;
    } else {
      await sqlClient`
        UPDATE public.tenants
        SET nombre = ${nombre},
            plan = ${plan},
            config = ${sqlClient.json(config)},
            updated_at = NOW()
        WHERE slug = ${event.slug}
      `;
    }
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
