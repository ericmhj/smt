import CircuitBreaker from 'opossum';
import type { CreditClientConfig, CreditOperation, CreditResult } from './credit.types.js';

export class CreditClient {
  private breaker: CircuitBreaker;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: CreditClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;

    // Create circuit breaker wrapping the consume function
    this.breaker = new CircuitBreaker(
      (tenantId: string, operation: CreditOperation) => this.doConsume(tenantId, operation),
      {
        timeout: config.timeoutMs,
        errorThresholdPercentage: 50,
        resetTimeout: config.circuitBreaker.resetTimeoutMs,
        volumeThreshold: config.circuitBreaker.failureThreshold,
      },
    );

    this.breaker.on('open', () => {
      console.warn('[CreditClient] Circuit breaker ABIERTO — licenseService no responde');
    });
    this.breaker.on('halfOpen', () => {
      console.log('[CreditClient] Circuit breaker half-open, probando reconexión...');
    });
    this.breaker.on('close', () => {
      console.log('[CreditClient] Circuit breaker CERRADO — servicio recuperado');
    });
  }

  async consume(tenantId: string, operation: CreditOperation): Promise<CreditResult> {
    try {
      return (await this.breaker.fire(tenantId, operation)) as CreditResult;
    } catch (error: any) {
      // Circuit is open or request failed
      if (this.breaker.opened) {
        return { status: 'deferred', debtId: `debt-${Date.now()}` };
      }
      throw error;
    }
  }

  async compensate(tenantId: string, operationId: string): Promise<void> {
    const url = `${this.baseUrl}/api/v1/tenants/${tenantId}/credits/compensate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Compensate failed: ${response.status}`);
    }
  }

  getCircuitState(): 'closed' | 'open' | 'half-open' {
    if (this.breaker.opened) return 'open';
    if (this.breaker.halfOpen) return 'half-open';
    return 'closed';
  }

  private async doConsume(tenantId: string, operation: CreditOperation): Promise<CreditResult> {
    const url = `${this.baseUrl}/api/v1/tenants/${tenantId}/credits/consume`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 200) {
      const data = (await response.json()) as { remainingCredits: number; operationId: string };
      return { status: 'approved', remainingCredits: data.remainingCredits, operationId: data.operationId };
    }

    if (response.status === 402) {
      const data = (await response.json()) as { message: string };
      return { status: 'insufficient', message: data.message || 'Créditos insuficientes' };
    }

    throw new Error(`License service responded with ${response.status}`);
  }
}
