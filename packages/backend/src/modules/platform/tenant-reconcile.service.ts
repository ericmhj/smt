import { inArray } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service.js';
import type { TenantCreatedEvent } from '../kafka/kafka.events.js';

/** Dato de materialización que devuelve el license-service. */
interface ProvisioningInfo {
  tenantId: string;
  slug: string;
  nombre: string;
  planCodigo: string | null;
  estado: string;
  adminEmail: string;
}

export interface TenantReconcileConfig {
  licenseServiceUrl: string;
  gatewaySecret: string;
  gatewayRole: string;
  timeoutMs: number;
}

export interface ReconcileResult {
  checked: number;
  created: string[];
  skipped: number;
  failed: Array<{ slug: string; error: string }>;
}

/**
 * Reconciliación masiva de tenants desde la fuente de verdad (license-service).
 *
 * Consulta todos los tenants del license-service vía REST (server-to-server, sin
 * depender de Kafka) y materializa en SMT los que falten, usando el provisioning
 * idempotente existente. Es la red de seguridad ante fallos de red/Kafka: como el
 * tenant ya existe en la fuente de verdad, este proceso solo crea el schema y
 * asegura el usuario admin en Keycloak.
 */
export class TenantReconcileService {
  constructor(
    private db: Database,
    private provisioning: TenantProvisioningService,
    private config: TenantReconcileConfig,
  ) {}

  async reconcileAll(): Promise<ReconcileResult> {
    const infos = await this.fetchProvisioningInfo();

    const result: ReconcileResult = { checked: infos.length, created: [], skipped: 0, failed: [] };

    if (infos.length === 0) return result;

    // Correlación por license_tenant_id (fuente de verdad) y por slug.
    const licenseIds = infos.map((i) => i.tenantId);
    const existing = await this.db
      .select({ licenseTenantId: tenants.licenseTenantId, slug: tenants.slug })
      .from(tenants)
      .where(inArray(tenants.licenseTenantId, licenseIds));

    const existingLicenseIds = new Set(existing.map((e) => e.licenseTenantId).filter(Boolean) as string[]);
    const existingSlugs = new Set(existing.map((e) => e.slug));

    for (const info of infos) {
      // Ya materializado (por correlación o por slug): nada que hacer.
      if (existingLicenseIds.has(info.tenantId) || existingSlugs.has(info.slug)) {
        result.skipped++;
        continue;
      }

      try {
        await this.provisioning.provisionTenant(this.toEvent(info));
        result.created.push(info.slug);
      } catch (error) {
        result.failed.push({
          slug: info.slug,
          error: error instanceof Error ? error.message : 'error desconocido',
        });
      }
    }

    return result;
  }

  private toEvent(info: ProvisioningInfo): TenantCreatedEvent {
    return {
      type: 'tenant.created',
      tenant_id: info.tenantId,
      slug: info.slug,
      nombre: info.nombre,
      admin_email: info.adminEmail,
      plan_codigo: info.planCodigo ?? undefined,
      estado: info.estado,
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchProvisioningInfo(): Promise<ProvisioningInfo[]> {
    const url = `${this.config.licenseServiceUrl}/api/v1/tenants/provisioning-info`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Autenticación server-to-server (mismo patrón que report-charge.service).
        'X-Consumer-Id': '00000000-0000-0000-0000-000000000001',
        'X-Gateway-Secret': this.config.gatewaySecret,
        'X-User-Role': this.config.gatewayRole,
        'X-License-Id': '00000000-0000-0000-0000-000000000001',
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`license-service respondió ${response.status} al listar provisioning-info`);
    }

    const body = (await response.json()) as { data?: ProvisioningInfo[] };
    return body.data ?? [];
  }
}
