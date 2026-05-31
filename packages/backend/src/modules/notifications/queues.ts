import { Queue, Worker, type Job } from 'bullmq';
import { db } from '../../db/index.js';
import { notifications } from '../../db/schema/notifications.js';
import type { NotificationJobData, EmailJobData } from './notification.types.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function getRedisConnection() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
  };
}

const connection = getRedisConnection();

// --- Queues ---

export const pushQueue = new Queue<NotificationJobData>('notifications-push', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const emailQueue = new Queue<EmailJobData>('notifications-email', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// --- Workers ---

let pushWorker: Worker<NotificationJobData> | null = null;
let emailWorker: Worker<EmailJobData> | null = null;

/**
 * Push worker: persists notification in the database.
 */
export function startPushWorker(): Worker<NotificationJobData> {
  if (pushWorker) return pushWorker;

  pushWorker = new Worker<NotificationJobData>(
    'notifications-push',
    async (job: Job<NotificationJobData>) => {
      const { recipientId, type, data } = job.data;

      await db.insert(notifications).values({
        recipientId,
        type,
        payload: data,
        isRead: false,
      });

      job.log(`Notification persisted for user ${recipientId}, type: ${type}`);
    },
    { connection, concurrency: 5 },
  );

  pushWorker.on('failed', (job, err) => {
    console.error(
      `[PushWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      err.message,
    );
  });

  pushWorker.on('completed', (job) => {
    console.log(`[PushWorker] Job ${job.id} completed`);
  });

  return pushWorker;
}

/**
 * Email worker: sends email notification (logs for now, actual SMTP later).
 */
export function startEmailWorker(): Worker<EmailJobData> {
  if (emailWorker) return emailWorker;

  emailWorker = new Worker<EmailJobData>(
    'notifications-email',
    async (job: Job<EmailJobData>) => {
      const { recipientEmail, subject, body } = job.data;

      // TODO: Integrate actual SMTP transport (nodemailer) in production
      console.log(`[EmailWorker] Sending email to ${recipientEmail}`);
      console.log(`[EmailWorker] Subject: ${subject}`);
      console.log(`[EmailWorker] Body: ${body}`);

      job.log(`Email sent to ${recipientEmail}`);
    },
    { connection, concurrency: 3 },
  );

  emailWorker.on('failed', (job, err) => {
    console.error(
      `[EmailWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      err.message,
    );
  });

  emailWorker.on('completed', (job) => {
    console.log(`[EmailWorker] Job ${job.id} completed`);
  });

  return emailWorker;
}

/**
 * Start all notification workers.
 */
export function startNotificationWorkers(): void {
  startPushWorker();
  startEmailWorker();
  console.log('[Notifications] Workers started');
}

/**
 * Gracefully close all queues and workers.
 */
export async function closeNotificationQueues(): Promise<void> {
  await pushWorker?.close();
  await emailWorker?.close();
  await pushQueue.close();
  await emailQueue.close();
  pushWorker = null;
  emailWorker = null;
}
