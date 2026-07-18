import CircuitBreaker from 'opossum';
import { AuthError } from './auth.service.js';

export interface LicenseStatus {
  status: 'active' | 'suspended' | 'expired';
  tenantSlug: string;
}

export interface LicenseClientConfig {
  baseUrl: string;
  timeoutMs: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}

export class LicenseClient {
  private breaker: CircuitBreaker<[string], LicenseStatus>;

  constructor(private config: LicenseClientConfig) {
    this.breaker = new CircuitBreaker(
      (tenantSlug: string) => this.fetchAccess(tenantSlug),
      {
        timeout: config.timeoutMs,
        errorThresholdPercentage: 100, // use volumeThreshold for count-based
        volumeThreshold: config.circuitBreaker.failureThreshold,
        resetTimeout: config.circuitBreaker.resetTimeoutMs,
        rollingCountTimeout: config.circuitBreaker.resetTimeoutMs,
      },
    );

    this.breaker.fallback(() => {
      throw new AuthError(
        503,
        'LICENSE_SERVICE_UNAVAILABLE',
        'Servicio de licencias no disponible',
      );
    });
  }

  /**
   * Check license access for a tenant.
   * Returns the license status on success.
   * Throws AuthError on failure (suspended, expired, unavailable).
   */
  async checkAccess(tenantSlug: string): Promise<LicenseStatus> {
    try {
      const result = await this.breaker.fire(tenantSlug);
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        503,
        'LICENSE_SERVICE_UNAVAILABLE',
        'Servicio de licencias no disponible',
      );
    }
  }

  /**
   * Internal fetch call to the License Service.
   * This method is wrapped by the circuit breaker.
   */
  private async fetchAccess(tenantSlug: string): Promise<LicenseStatus> {
    const url = `${this.config.baseUrl}/access/${encodeURIComponent(tenantSlug)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      // Network error or timeout
      throw new AuthError(
        503,
        'LICENSE_SERVICE_UNAVAILABLE',
        'Servicio de licencias no disponible',
      );
    }

    if (response.status >= 500) {
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

    const data = (await response.json()) as { status: string; tenantSlug?: string };
    const status = data.status;

    if (status === 'active') {
      return { status: 'active', tenantSlug };
    }

    if (status === 'suspended') {
      throw new AuthError(
        403,
        'LICENSE_SUSPENDED',
        'Servicio suspendido. Contacte a su proveedor.',
      );
    }

    if (status === 'expired') {
      throw new AuthError(
        403,
        'LICENSE_EXPIRED',
        'Licencia expirada. Contacte a su proveedor.',
      );
    }

    // Unknown status — treat as unavailable
    throw new AuthError(
      503,
      'LICENSE_SERVICE_UNAVAILABLE',
      'Servicio de licencias no disponible',
    );
  }
}
