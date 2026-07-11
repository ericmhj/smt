import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import type { KafkaConfig, TenantLifecycleEvent } from './kafka.events.js';

/**
 * Kafka consumer for tenant lifecycle events from the License Service.
 * Listens on topic `tenant.lifecycle` with consumer group `sgr-tenant-lifecycle`.
 *
 * Features:
 * - Manual offset commit (no autoCommit) — failed messages are redelivered
 * - Exponential backoff reconnection: 1s, 2s, 4s, 8s, 16s (max 5 attempts)
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Should NOT be initialized when STANDALONE_AUTH=true
 */
export class TenantLifecycleConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private isRunning = false;
  private topic: string;

  /** Handler injected from outside (TenantProvisioningService) */
  private handler: ((event: TenantLifecycleEvent) => Promise<void>) | null = null;

  constructor(config: KafkaConfig) {
    this.topic = config.topic;
    this.kafka = new Kafka({
      clientId: 'sgr-backend',
      brokers: config.brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 1000,
        retries: 5,
        factor: 2,
        maxRetryTime: 16000,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  setHandler(handler: (event: TenantLifecycleEvent) => Promise<void>): void {
    this.handler = handler;
  }

  /**
   * Connect to the broker with exponential backoff and start consuming.
   * Backoff delays: 1s, 2s, 4s, 8s, 16s (2^(N-1) seconds, max 5 attempts).
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    await this.connectWithBackoff();

    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.processMessage(payload);
      },
    });

    this.isRunning = true;
    this.registerShutdownHooks();
    console.log(`[KafkaConsumer] Escuchando topic: ${this.topic}`);
  }

  /** Graceful shutdown — disconnects consumer. */
  async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    console.log('[KafkaConsumer] Cerrando conexión...');
    await this.consumer.disconnect();
    this.isRunning = false;
    console.log('[KafkaConsumer] Desconectado');
  }

  /**
   * Attempts to connect to the Kafka broker with exponential backoff.
   * Delays: 1s, 2s, 4s, 8s, 16s (2^(N-1) seconds).
   * Throws after 5 failed attempts.
   */
  private async connectWithBackoff(): Promise<void> {
    const maxAttempts = 5;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        await this.consumer.connect();
        console.log('[KafkaConsumer] Conectado al broker');
        return;
      } catch (error) {
        attempt++;
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s, 8s, 16s
        console.error(
          `[KafkaConsumer] Error al conectar (intento ${attempt}/${maxAttempts}). Reintento en ${delay}ms`,
          error instanceof Error ? error.message : error,
        );
        if (attempt >= maxAttempts) {
          console.error('[KafkaConsumer] Se agotaron los intentos de reconexión');
          throw error;
        }
        await this.delay(delay);
      }
    }
  }

  /**
   * Process a single Kafka message. Commits offset only on success.
   * On failure, offset is NOT committed so Kafka will redeliver.
   */
  private async processMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString()) as TenantLifecycleEvent;
      console.log(`[KafkaConsumer] Evento recibido: ${event.type} (slug: ${event.slug})`);

      if (this.handler) {
        await this.handler(event);
      }

      // Commit offset only on successful processing
      await this.consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        },
      ]);
    } catch (error) {
      // Do NOT commit offset — Kafka will redeliver this message
      console.error(
        '[KafkaConsumer] Error procesando evento, no se confirma offset para reintento:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /** Register SIGTERM/SIGINT handlers for graceful shutdown. */
  private registerShutdownHooks(): void {
    const shutdownHandler = async () => {
      await this.shutdown();
    };

    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
  }

  /** Promise-based delay utility. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
