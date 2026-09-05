import { AuthError } from './auth.service.js';

export interface LicenseStatus {
  status: string;
  active: boolean;
}

export interface LicenseClientConfig {
  /** Base URL del license-service SIN el sufijo /api/v1 (ej. http://license-service:8080). */
  baseUrl: string;
  timeoutMs: number;
  /** Secreto compartido con el gateway (X-Gateway-Secret). */
  gatewaySecret: string;
  /** Rol operacional para llamadas servicio-a-servicio (X-User-Role). */
  gatewayRole: string;
}

/**
 * Cliente al license-service (fuente de verdad del estado del tenant).
 *
 * En el login, SMT valida el estado EFECTIVO del tenant contra el license-service
 * (mismo criterio que la vista de planes: `getEstadoEfectivo()`, que considera el
 * pago mensual). No se lee el espejo `public.tenants.status` de SMT porque puede
 * quedar desactualizado respecto a la fuente de verdad.
 *
 * Endpoint: GET /api/v1/tenants/{licenseTenantId}/state — server-to-server,
 * autenticado por gateway header (platform_admin + X-Gateway-Secret). Se usa el
 * UUID del tenant en el license-service (mapeo `public.tenants.license_tenant_id`).
 */
export class LicenseClient {
  // ID sintético de consumer para llamadas servicio-a-servicio (mismo patrón que
  // TenantReconcileService / report-charge).
  private static readonly SERVICE_CONSUMER_ID = '00000000-0000-0000-0000-000000000001';

  constructor(private config: LicenseClientConfig) {}

  /**
   * Consulta el estado efectivo del tenant en el license-service.
   *
   * @param licenseTenantId UUID del tenant en el license-service.
   * @throws AuthError 403 si el tenant está suspendido/expirado.
   * @throws AuthError 503 si el license-service no responde (hard-fail: sin estado
   *         confirmado no se permite el acceso).
   */
  async checkAccess(licenseTenantId: string): Promise<LicenseStatus> {
    const url = `${this.config.baseUrl}/api/v1/tenants/${encodeURIComponent(licenseTenantId)}/state`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Consumer-Id': LicenseClient.SERVICE_CONSUMER_ID,
          'X-License-Id': LicenseClient.SERVICE_CONSUMER_ID,
          'X-Gateway-Secret': this.config.gatewaySecret,
          'X-User-Role': this.config.gatewayRole,
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      // Error de red o timeout: sin estado confirmado, no se permite el acceso.
      throw new AuthError(
        503,
        'LICENSE_SERVICE_UNAVAILABLE',
        'Servicio de licencias no disponible',
      );
    }

    if (!response.ok) {
      throw new AuthError(
        503,
        'LICENSE_SERVICE_UNAVAILABLE',
        'Servicio de licencias no disponible',
      );
    }

    const data = (await response.json()) as { status?: string; active?: boolean };
    const status = (data.status || '').toUpperCase();
    const active = data.active === true;

    if (active && status === 'ACTIVE') {
      return { status: 'active', active: true };
    }

    if (status === 'EXPIRED') {
      throw new AuthError(403, 'LICENSE_EXPIRED', 'Licencia expirada. Contacte a su proveedor.');
    }

    // SUSPENDED, CANCELLED, ONBOARDING o cualquier estado no activo → bloquear.
    throw new AuthError(
      403,
      'LICENSE_SUSPENDED',
      'Servicio suspendido. Contacte a su proveedor.',
    );
  }
}
