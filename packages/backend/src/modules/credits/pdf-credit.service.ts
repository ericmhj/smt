import { CreditClient } from './credit.client.js';
import { CreditDebtService } from './credit-debt.service.js';
import type { CreditOperation } from './credit.types.js';

export interface PdfCreditConfig {
  standaloneAuth: boolean;
  creditClient?: CreditClient;
  debtService?: CreditDebtService;
}

export class PdfCreditService {
  private config: PdfCreditConfig;

  constructor(config: PdfCreditConfig) {
    this.config = config;
  }

  /**
   * Validates credit availability before PDF generation.
   * Returns { proceed: true } if PDF can be generated,
   * or { proceed: false, error } if generation should be blocked.
   *
   * Side effects: may consume a credit or register a debt.
   */
  async validateBeforeGeneration(
    tenantId: string,
    reactivoId: string,
    formType: string,
  ): Promise<
    | { proceed: true; operationId?: string; warning?: string }
    | { proceed: false; statusCode: number; message: string }
  > {
    // Standalone mode: always allow
    if (this.config.standaloneAuth || !this.config.creditClient) {
      return { proceed: true };
    }

    const operation: CreditOperation = {
      operationType: 'pdf_generation',
      metadata: { reactivoId, formType },
    };

    try {
      const result = await this.config.creditClient.consume(tenantId, operation);

      if (result.status === 'approved') {
        return { proceed: true, operationId: result.operationId };
      }

      if (result.status === 'insufficient') {
        return { proceed: false, statusCode: 402, message: result.message };
      }

      if (result.status === 'deferred') {
        // Circuit breaker open — register debt and allow generation
        if (this.config.debtService) {
          await this.config.debtService.registerDebt(tenantId, operation);
        }
        return { proceed: true, warning: 'Credit consumption deferred due to service unavailability' };
      }

      return { proceed: true };
    } catch (error) {
      // Unrecoverable error — register debt and allow (fail-open)
      console.error('[PdfCreditService] Error consumiendo crédito, permitiendo generación con deuda:', error);
      if (this.config.debtService) {
        await this.config.debtService.registerDebt(tenantId, operation);
      }
      return { proceed: true, warning: 'Credit consumption failed, debt registered' };
    }
  }

  /**
   * Compensate a consumed credit if PDF generation fails.
   */
  async compensateOnFailure(tenantId: string, operationId: string): Promise<void> {
    if (this.config.standaloneAuth || !this.config.creditClient || !operationId) {
      return;
    }

    try {
      await this.config.creditClient.compensate(tenantId, operationId);
      console.log(`[PdfCreditService] Crédito compensado: ${operationId}`);
    } catch (error) {
      console.error('[PdfCreditService] Error en compensación, registrando deuda de compensación:', error);
      // If compensate fails, register as a negative debt for manual reconciliation
    }
  }
}
