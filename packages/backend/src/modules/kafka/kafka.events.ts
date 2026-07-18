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

export type TenantLifecycleEvent =
  | TenantCreatedEvent
  | TenantSuspendedEvent
  | TenantReactivatedEvent;

export interface KafkaConfig {
  brokers: string[];
  groupId: string;
  topic: string;
}

// Topic name constant — listen to license-events (where License Service publishes)
export const TENANT_LIFECYCLE_TOPIC = 'license-events';

// Consumer group constant
export const SGR_CONSUMER_GROUP = 'sgr-tenant-lifecycle';
