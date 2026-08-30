/**
 * Kafka event types for tenant lifecycle management.
 * These events are produced by the License Service and consumed by SGR.
 */

export interface TenantCreatedEvent {
  type: 'tenant.created';
  tenant_id: string;
  slug: string;
  nombre: string;
  admin_email: string;
  timestamp: string; // ISO 8601
}

export interface TenantSuspendedEvent {
  type: 'tenant.suspended';
  tenant_id: string;
  slug: string;
  timestamp: string; // ISO 8601
}

export interface TenantReactivatedEvent {
  type: 'tenant.reactivated';
  tenant_id: string;
  slug: string;
  timestamp: string; // ISO 8601
}

/**
 * Credit ledger entry event — published by license-service after any credit operation.
 * Used to keep the local consumption account (saldo espejo) in sync.
 */
export interface CreditLedgerEntryEvent {
  type: 'credit.ledger.entry';
  tenant_id: string;
  slug: string;
  entry: {
    id: string;
    tipo: 'consumo' | 'recarga' | 'bonus' | 'ajuste' | 'compensacion' | 'excedente';
    cantidad: number;
    saldo_resultante: number;
    concepto: string;
    perfil_documento?: string;
    referencia?: string;
  };
  creditos_totales_adquiridos: number;
  timestamp: string;
}

export type TenantLifecycleEvent =
  | TenantCreatedEvent
  | TenantSuspendedEvent
  | TenantReactivatedEvent
  | CreditLedgerEntryEvent;

export interface KafkaConfig {
  brokers: string[];
  groupId: string;
  topic: string;
}

// Topic name constant — listen to license-events (where License Service publishes)
export const TENANT_LIFECYCLE_TOPIC = 'license-events';

// Consumer group constant
export const SGR_CONSUMER_GROUP = 'sgr-tenant-lifecycle';
