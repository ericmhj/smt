import { Worker, type Job } from 'bullmq';
import { db } from '../../db/index.js';
import { SLAService } from './sla.service.js';
import { pushQueue } from '../notifications/queues.js';

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

let slaWorker: Worker | null = null;

/**
 * Start the SLA check worker.
 * Queries tickets approaching deadline (≥80%) or overdue,
 * and sends notifications via the notification module.
 */
export function startSLAWorker(): Worker {
  if (slaWorker) return slaWorker;

  const slaService = new SLAService(db);

  slaWorker = new Worker(
    'tickets-sla-check',
    async (job: Job) => {
      job.log('Running SLA check...');

      // Get overdue tickets
      const overdueTickets = await slaService.checkOverdue();

      for (const ticket of overdueTickets) {
        // Send notification for overdue ticket
        await pushQueue.add('sla-overdue', {
          recipientId: ticket.clienteId, // Notify relevant parties
          type: 'ticket_overdue',
          data: {
            ticketId: ticket.id,
            estado: ticket.estado,
            prioridad: ticket.prioridad,
            fechaLimite: ticket.fechaLimite,
          },
        });
      }

      job.log(`SLA check complete. Found ${overdueTickets.length} overdue tickets.`);
    },
    { connection, concurrency: 1 },
  );

  slaWorker.on('failed', (job, err) => {
    console.error(
      `[SLAWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      err.message,
    );
  });

  slaWorker.on('completed', (job) => {
    console.log(`[SLAWorker] Job ${job.id} completed`);
  });

  return slaWorker;
}

/**
 * Gracefully close the SLA worker.
 */
export async function closeSLAWorker(): Promise<void> {
  await slaWorker?.close();
  slaWorker = null;
}
