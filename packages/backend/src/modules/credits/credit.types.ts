export interface CreditClientConfig {
  baseUrl: string;
  timeoutMs: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}

export interface CreditOperation {
  operationType: 'pdf_generation';
  metadata: {
    reactivoId: string;
    formType: string;
  };
}

export type CreditResult =
  | { status: 'approved'; remainingCredits: number; operationId: string }
  | { status: 'insufficient'; message: string }
  | { status: 'deferred'; debtId: string }; // circuit breaker open, debt registered
