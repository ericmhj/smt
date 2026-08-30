import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { TenantLifecycleConsumer } from './modules/kafka/kafka.consumer.js';
import { TenantProvisioningService } from './modules/tenant/tenant-provisioning.service.js';
import { ConsumptionAccountService } from './modules/consumption/consumption.service.js';
import { KeycloakAdminClient } from './modules/tenant/keycloak-admin-client.js';
import { db } from './db/index.js';
import { deriveSlug } from './lib/slug.js';

let kafkaConsumer: TenantLifecycleConsumer | null = null;

const start = async () => {
  try {
    const config = loadConfig();
    const app = await buildApp();

    // Conditional initialization for integrated mode
    if (!config.standaloneAuth && config.kafka) {
      // Initialize Keycloak Admin Client for user provisioning
      let keycloakAdmin: KeycloakAdminClient | null = null;
      console.log('[Server] Modo integrado detectado. Verificando config de Keycloak Admin...');
      console.log(`[Server] keycloakAdmin.baseUrl = "${config.keycloakAdmin?.baseUrl || '(vacío)'}"`);
      console.log(`[Server] keycloakAdmin.adminUser = "${config.keycloakAdmin?.adminUser || '(vacío)'}"`);

      if (config.keycloakAdmin?.baseUrl && config.keycloakAdmin?.adminUser) {
        keycloakAdmin = new KeycloakAdminClient({
          baseUrl: config.keycloakAdmin.baseUrl,
          realm: config.keycloakAdmin.targetRealm,
          adminRealm: config.keycloakAdmin.adminRealm,
          adminUser: config.keycloakAdmin.adminUser,
          adminPassword: config.keycloakAdmin.adminPassword,
        });
        console.log(`[Server] KeycloakAdminClient inicializado (realm: ${config.keycloakAdmin.targetRealm})`);
      } else {
        console.warn('[Server] KeycloakAdminClient NO inicializado — variables KEYCLOAK_ADMIN_URL o KEYCLOAK_ADMIN_USER no configuradas');
      }

      const provisioningService = new TenantProvisioningService(db, keycloakAdmin);
      const consumptionService = new ConsumptionAccountService(db);

      kafkaConsumer = new TenantLifecycleConsumer(config.kafka);
      kafkaConsumer.setHandler(async (rawEvent: any) => {
        // License Service sends DomainEvent wrapper: { eventType, payload: {...} }
        // Or direct format: { type, tenant_id, slug, ... }
        let eventType: string;
        let payload: any;

        if (rawEvent.eventType) {
          // DomainEvent wrapper format
          eventType = rawEvent.eventType;
          payload = rawEvent.payload || rawEvent;
        } else {
          // Direct format
          eventType = rawEvent.type;
          payload = rawEvent;
        }

        // Derive slug from nombre if not present
        if (!payload.slug && payload.nombre) {
          payload.slug = deriveSlug(payload.nombre);
        }
        if (!payload.admin_email && payload.emailContacto) {
          payload.admin_email = payload.emailContacto;
        }

        console.log(`[KafkaHandler] Processing: ${eventType}, slug: ${payload.slug || payload.tenantId}`);

        switch (eventType) {
          case 'tenant.activated':
          case 'tenant.created':
          case 'tenant.onboarded':
            if (payload.slug || payload.nombre) {
              const adminEmail = payload.admin_email || payload.emailContacto;
              if (!adminEmail) {
                console.error(`[KafkaHandler] Evento ${eventType} rechazado: no se proporcionó admin_email para slug '${payload.slug}'`);
                break;
              }
              await provisioningService.provisionTenant({
                type: 'tenant.created',
                tenant_id: payload.tenantId || payload.tenant_id || '',
                slug: payload.slug || deriveSlug(payload.nombre),
                nombre: payload.nombre || payload.slug || '',
                admin_email: adminEmail,
                timestamp: payload.occurredAt || new Date().toISOString(),
              });
            }
            break;
          case 'tenant.suspended':
            if (payload.slug) {
              await provisioningService.suspendTenant(payload.slug);
            }
            break;
          case 'tenant.reactivated':
            if (payload.slug) {
              await provisioningService.reactivateTenant(payload.slug);
            }
            break;
          case 'credit.ledger.entry':
            if (payload.slug && payload.entry) {
              await consumptionService.handleLedgerEntry({
                type: 'credit.ledger.entry',
                tenant_id: payload.tenant_id || payload.tenantId || '',
                slug: payload.slug,
                entry: payload.entry,
                creditos_totales_adquiridos: payload.creditos_totales_adquiridos || 0,
                timestamp: payload.timestamp || payload.occurredAt || new Date().toISOString(),
              });
            }
            break;
        }
      });

      try {
        await kafkaConsumer.start();
        app.log.info('[Integración] Kafka consumer iniciado');
      } catch (error) {
        app.log.error('[Integración] Error iniciando Kafka consumer — el servicio continúa sin Kafka');
        kafkaConsumer = null;
      }
    }

    const port = Number(process.env.PORT) || 3001;
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server running on port ${port}`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      app.log.info(`${signal} recibido, cerrando...`);
      if (kafkaConsumer) {
        await kafkaConsumer.shutdown();
      }
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
