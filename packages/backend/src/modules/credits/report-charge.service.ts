import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { tenants } from '../../db/schema/platform.js';
import { countReportPoints } from './report-points.util.js';

export interface ReportChargeConfig {
  /** Modo standalone: no hay license-service, se omite el cobro. */
  standaloneAuth: boolean;
  /** URL base del license-service (p.ej. http://license-app:8080). */
  licenseServiceUrl?: string;
  /** Timeout de la llamada HTTP en ms. */
  timeoutMs?: number;
  /**
   * Secreto compartido con el gateway del license-service (X-Gateway-Secret).
   * Requerido para autenticar llamadas servicio-a-servicio cuando el
   * license-service tiene trust-gateway-headers habilitado.
   */
  gatewaySecret?: string;
  /**
   * Rol operacional a declarar en X-User-Role. Se usa 'platform_admin' para
   * quedar exento del confinamiento por tenant (llamada cross-tenant legítima).
   */
  gatewayRole?: string;
}

export type ReportChargeResult =
  | { charged: true; numeroPuntos: number }
  | {
      charged: false;
      /** Motivo del no-cobro: define si el PDF debe marcarse DRAFT. */
      reason:
        | 'standalone'          // sin license-service (modo local) — NO draft
        | 'no_mapping'          // tenant sin license_tenant_id — draft
        | 'inconsistent_points' // matrices inconsistentes — draft
        | 'insufficient_balance'// saldo insuficiente — draft
        | 'service_error';      // license-service caído/error — draft
      /** true si el reporte debe generarse con marca de agua DRAFT. */
      draft: boolean;
      message: string;
      numeroPuntos?: number;
    };

/**
 * Aplica el cargo variable por la finalización de un reporte de estudio.
 *
 * Flujo:
 *  1. Cuenta numeroPuntos desde el reporte finalizado (HTML real) validando
 *     consistencia entre las dos matrices por área.
 *  2. Resuelve el license_tenant_id (mapeo cross-service) por slug del tenant.
 *  3. Llama a POST /api/v1/tenants/{licenseTenantId}/reportes/consumo.
 *
 * El costo total = costoReporte(plan) + costoPuntoMuestreo(plan) * numeroPuntos,
 * y lo calcula el license-service con las tarifas del plan del tenant.
 *
 * Cualquier fallo (mapeo ausente, matrices inconsistentes, saldo insuficiente
 * o servicio caído) resulta en `charged:false` con `draft:true` para que el PDF
 * se genere con marca de agua DRAFT.
 */
export class ReportChargeService {
  private db: Database;
  private config: ReportChargeConfig;

  constructor(db: Database, config: ReportChargeConfig) {
    this.db = db;
    this.config = config;
  }

  async chargeOnFinalize(
    reactivoId: string,
    responses: Record<string, unknown>,
    tenantSlug: string,
    usuarioId: string,
  ): Promise<ReportChargeResult> {
    // Modo standalone: no hay facturación; el reporte es válido sin DRAFT.
    if (this.config.standaloneAuth || !this.config.licenseServiceUrl) {
      return {
        charged: false,
        reason: 'standalone',
        draft: false,
        message: 'Modo standalone: cobro variable omitido',
      };
    }

    // 1. Contar puntos desde el reporte finalizado (valor real) y validar matrices.
    const count = countReportPoints(responses);
    if (!count.consistent) {
      return {
        charged: false,
        reason: 'inconsistent_points',
        draft: true,
        message:
          count.inconsistency ||
          'Inconsistencia entre las matrices de puntos del reporte; cobro no aplicado.',
        numeroPuntos: count.numeroPuntos,
      };
    }

    const numeroPuntos = count.numeroPuntos;

    // 2. Resolver el license_tenant_id (fuente de verdad del cobro).
    const tenantRow = await this.db
      .select({ licenseTenantId: tenants.licenseTenantId })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    const licenseTenantId = tenantRow[0]?.licenseTenantId;
    if (!licenseTenantId) {
      return {
        charged: false,
        reason: 'no_mapping',
        draft: true,
        message: `Tenant '${tenantSlug}' sin license_tenant_id; cobro no aplicado.`,
        numeroPuntos,
      };
    }

    // 3. Llamar al license-service para aplicar el cargo variable.
    // Autenticación servicio-a-servicio vía headers de gateway:
    //   - X-Consumer-Id : UUID del usuario que finaliza el reporte.
    //   - X-Gateway-Secret : secreto compartido (trust-gateway-headers).
    //   - X-User-Role : platform_admin (exento del confinamiento por tenant).
    //   - X-License-Id : license_tenant_id (coincide con el path).
    const url = `${this.config.licenseServiceUrl}/api/v1/tenants/${licenseTenantId}/reportes/consumo`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Consumer-Id': usuarioId,
          'X-Gateway-Secret': this.config.gatewaySecret ?? 'mikel-gateway-internal-dev-2026',
          'X-User-Role': this.config.gatewayRole ?? 'platform_admin',
          'X-License-Id': licenseTenantId,
        },
        body: JSON.stringify({
          documentoId: reactivoId,
          usuarioId,
          numeroPuntos,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5000),
      });

      // 202 ACCEPTED = cargo aplicado.
      if (response.status === 202 || response.status === 200) {
        return { charged: true, numeroPuntos };
      }

      // Saldo insuficiente (el license-service devuelve 4xx con el detalle).
      if (response.status === 402 || response.status === 409 || response.status === 422) {
        return {
          charged: false,
          reason: 'insufficient_balance',
          draft: true,
          message: `Saldo insuficiente para el cargo (${numeroPuntos} puntos).`,
          numeroPuntos,
        };
      }

      return {
        charged: false,
        reason: 'service_error',
        draft: true,
        message: `license-service respondió ${response.status}`,
        numeroPuntos,
      };
    } catch (error) {
      return {
        charged: false,
        reason: 'service_error',
        draft: true,
        message: `Error llamando a license-service: ${error instanceof Error ? error.message : String(error)}`,
        numeroPuntos,
      };
    }
  }
}
