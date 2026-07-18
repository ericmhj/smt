import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { TenantLifecycleConsumer } from './modules/kafka/kafka.consumer.js';
import { TenantProvisioningService } from './modules/tenant/tenant-provisioning.service.js';
import { KeycloakAdminClient } from './modules/tenant/keycloak-admin-client.js';
import { db } from './db/index.js';

let kafkaConsumer: TenantLifecycleConsumer | null = null;

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp();

  // Conditional initialization for integrated mode
  if (!config.standaloneAuth && config.kafka) {
    // Initialize Keycloak Admin Client if configured
    let keycloakAdmin: KeycloakAdminClient | null = null;
    if (config.keycloakAdmin?.baseUrl && config.keycloakAdmin?.adminUser) {
      keycloakAdmin = new KeycloakAdminClient({
        baseUrl: config.keycloakAdmin.baseUrl,
        realm: config.keycloakAdmin.targetRealm,
        adminRealm: config.keycloakAdmin.adminRealm,
        adminUser: config.keycloakAdmin.adminUser,
        adminPassword: config.keycloakAdmin.adminPassword,
      });
      app.log.info('[Integración] Keycloak Admin Client inicializado');
    }

    const provisioningService = new TenantProvisioningService(db, keycloakAdmin);

    kafkaConsumer = new TenantLifecycleConsumer(config.kafka);
    kafkaConsumer.setHandler(async (event) => {
      switch (event.type) {
        case 'tenant.created':
          await provisioningService.provisionTenant(event);
          break;
        case 'tenant.suspended':
          await provisioningService.suspendTenant(event.slug);
          break;
        case 'tenant.reactivated':
          await provisioningService.reactivateTenant(event.slug);
          break;
      }
    });

    try {
      await kafkaConsumer.start();
      app.log.info('[Integración] Kafka consumer iniciado');
    } catch (error) {
      app.log.error('[Integración] Error iniciando Kafka consumer — el servicio continúa sin Kafka:', error);
      // Don't crash the server if Kafka is unavailable
      kafkaConsumer = null;
    }
  }

  // Start the server
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
}

start().catch((err) => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});
