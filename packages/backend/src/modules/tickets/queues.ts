import { Queue } from 'bullmq';

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

// ─── Queues ─────────────────────────────────────────────────────────────────

export const slaCheckQueue = new Queue('tickets-sla-check', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

export const assignmentQueue = new Queue('tickets-assignment', {
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

/**
 * Schedule the SLA check job to run every 15 minutes.
 */
export async function scheduleSLACheck(): Promise<void> {
  await slaCheckQueue.upsertJobScheduler(
    'sla-check-repeatable',
    {
      every: 15 * 60 * 1000, // 15 minutes in ms
    },
    {
      name: 'sla-check',
      data: {},
    },
  );
  console.log('[Tickets] SLA check scheduled every 15 minutes');
}

/**
 * Enqueue an assignment job for a newly created ticket.
 */
export async function enqueueAssignment(ticketId: string, clienteId: string): Promise<void> {
  await assignmentQueue.add('assign-ticket', { ticketId, clienteId });
}

/**
 * Gracefully close all ticket queues.
 */
export async function closeTicketQueues(): Promise<void> {
  await slaCheckQueue.close();
  await assignmentQueue.close();
}
