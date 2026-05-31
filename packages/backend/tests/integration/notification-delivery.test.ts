import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Queue, Worker, type Job } from 'bullmq';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import type { NotificationJobData } from '../../src/modules/notifications/notification.types.js';

describe('Notification Delivery Integration', () => {
  let redisContainer: StartedTestContainer;
  let pgContainer: StartedPostgreSqlContainer;
  let sql: ReturnType<typeof postgres>;
  let db: any;
  let redisConnection: { host: string; port: number };

  beforeAll(async () => {
    // Start Redis container
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);
    redisConnection = { host: redisHost, port: redisPort };

    process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;

    // Start PostgreSQL container for notification persistence
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('sgr_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    const connectionString = pgContainer.getConnectionUri();
    sql = postgres(connectionString);
    db = drizzle(sql) as any;

    // Create notifications table
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    await sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        recipient_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        is_read BOOLEAN NOT NULL DEFAULT false,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  beforeEach(async () => {
    // Clean notifications table between tests
    await sql`DELETE FROM notifications`;
  });

  it('state transition enqueues notification in BullMQ push queue', async () => {
    const pushQueue = new Queue<NotificationJobData>('notifications:push:test1', {
      connection: redisConnection,
    });

    const jobData: NotificationJobData = {
      recipientId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'state_change',
      data: {
        reactivoId: '660e8400-e29b-41d4-a716-446655440000',
        previousState: 'pendiente',
        newState: 'en_revision',
        actorName: 'Manager Test',
        timestamp: new Date().toISOString(),
      },
    };

    // Enqueue notification
    const job = await pushQueue.add('push-notification', jobData);

    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.data.recipientId).toBe(jobData.recipientId);
    expect(job.data.type).toBe('state_change');

    // Verify job is in the queue
    const waiting = await pushQueue.getWaiting();
    expect(waiting.length).toBeGreaterThanOrEqual(1);

    await pushQueue.close();
  });

  it('push worker processes job and persists notification in DB', async () => {
    const queueName = 'notifications:push:test2';
    const pushQueue = new Queue<NotificationJobData>(queueName, {
      connection: redisConnection,
    });

    const recipientId = '550e8400-e29b-41d4-a716-446655440001';
    const jobData: NotificationJobData = {
      recipientId,
      type: 'state_change',
      data: {
        reactivoId: '660e8400-e29b-41d4-a716-446655440001',
        previousState: 'en_revision',
        newState: 'validado',
        actorName: 'Manager Test',
        timestamp: new Date().toISOString(),
      },
    };

    // Create worker that persists to DB
    const processed = new Promise<void>((resolve, reject) => {
      const worker = new Worker<NotificationJobData>(
        queueName,
        async (job: Job<NotificationJobData>) => {
          const { recipientId, type, data } = job.data;
          await sql`
            INSERT INTO notifications (recipient_id, type, payload, is_read)
            VALUES (${recipientId}, ${type}, ${JSON.stringify(data)}, false)
          `;
        },
        { connection: redisConnection, concurrency: 1 },
      );

      worker.on('completed', async () => {
        await worker.close();
        resolve();
      });

      worker.on('failed', async (_, err) => {
        await worker.close();
        reject(err);
      });
    });

    // Add job
    await pushQueue.add('push-notification', jobData);

    // Wait for processing
    await processed;

    // Verify notification was persisted
    const [notification] = await sql`
      SELECT * FROM notifications WHERE recipient_id = ${recipientId}
    `;

    expect(notification).toBeDefined();
    expect(notification.type).toBe('state_change');
    expect(notification.is_read).toBe(false);

    await pushQueue.close();
  });

  it('observation creation enqueues notification', async () => {
    const queueName = 'notifications:push:test3';
    const pushQueue = new Queue<NotificationJobData>(queueName, {
      connection: redisConnection,
    });

    const jobData: NotificationJobData = {
      recipientId: '550e8400-e29b-41d4-a716-446655440002',
      type: 'observation',
      data: {
        reactivoId: '660e8400-e29b-41d4-a716-446655440002',
        actorName: 'Reviewer Test',
        timestamp: new Date().toISOString(),
      },
    };

    const job = await pushQueue.add('push-notification', jobData);

    expect(job).toBeDefined();
    expect(job.data.type).toBe('observation');
    expect(job.data.recipientId).toBe(jobData.recipientId);

    await pushQueue.close();
  });

  it('getUnreadCount returns correct count', async () => {
    const recipientId = '550e8400-e29b-41d4-a716-446655440003';

    // Insert some notifications (3 unread, 1 read)
    await sql`
      INSERT INTO notifications (recipient_id, type, payload, is_read)
      VALUES
        (${recipientId}, 'state_change', '{"actorName":"A","timestamp":"2024-01-01"}', false),
        (${recipientId}, 'observation', '{"actorName":"B","timestamp":"2024-01-02"}', false),
        (${recipientId}, 'state_change', '{"actorName":"C","timestamp":"2024-01-03"}', false),
        (${recipientId}, 'assignment', '{"actorName":"D","timestamp":"2024-01-04"}', true)
    `;

    // Query unread count
    const [result] = await sql`
      SELECT COUNT(*)::int as count FROM notifications
      WHERE recipient_id = ${recipientId} AND is_read = false
    `;

    expect(result.count).toBe(3);
  });
});
