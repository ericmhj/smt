/**
 * Kafka event types for tenant lifecycle management.
 * These events are produced by the License Service and consumed by SGR.
 */

/**
 * Metadatos de solo lectura del tenant en license-service, almacenados en
 * public.tenants.config como snapshot. NUNCA se editan desde SMT.
 */
export interface TenantConfigSnapshot {
  email_contacto?: string;
  modalidad_reporte?: string; // ESTANDAR | PERSONALIZADO
  fecha_alta?: string; // ISO 8601
}

export interface TenantCreatedEvent {
  // tenant.created / tenant.onboarded (creación), tenant.activated (activación)
  // y tenant.updated (cambio de nombre/plan) comparten esta forma.
  // tenant_id es el UUID de license-service (fuente de verdad) y se usa como
  // clave de correlación (license_tenant_id en public.tenants).
  type: 'tenant.created' | 'tenant.onboarded' | 'tenant.activated' | 'tenant.updated';
  tenant_id: string;
  slug: string;
  nombre: string;
  admin_email: string;
  // Código del plan resuelto desde planes.codigo (p.ej. 'esencial', 'empresarial').
  plan_codigo?: string;
  // Estado del tenant en license-service (ONBOARDING/ACTIVE/SUSPENDED/CANCELLED).
  estado?: string;
  // Snapshot de metadatos para public.tenants.config.
  config?: TenantConfigSnapshot;
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
