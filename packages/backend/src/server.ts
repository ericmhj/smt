import { buildApp } from './app.js';
import { loadConfig } from './lib/config.js';
import { TenantLifecycleConsumer } from './modules/kafka/kafka.consumer.js';
import { TenantProvisioningService } from './modules/tenant/tenant-provisioning.service.js';
import { db } from './db/index.js';

let kafkaConsumer: TenantLifecycleConsumer | null = null;

const start = async () => {
  try {
    const config = loadConfig();
    const app = await buildApp();

    // Conditional initialization for integrated mode
    if (!config.standaloneAuth && config.kafka) {
      const provisioningService = new TenantProvisioningService(db);

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
