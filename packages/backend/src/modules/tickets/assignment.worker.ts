import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tickets } from '../../db/schema/tickets.js';
import { AsignacionService } from './asignacion.service.js';

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

let assignmentWorker: Worker | null = null;

interface AssignmentJobData {
  ticketId: string;
  clienteId: string;
}

/**
 * Start the assignment worker.
 * Executes AsignacionService.executeRules and updates the ticket
 * if a matching tecnico is found.
 */
export function startAssignmentWorker(): Worker<AssignmentJobData> {
  if (assignmentWorker) return assignmentWorker;

  const asignacionService = new AsignacionService(db);

  assignmentWorker = new Worker<AssignmentJobData>(
    'tickets-assignment',
    async (job: Job<AssignmentJobData>) => {
      const { ticketId, clienteId } = job.data;

      job.log(`Attempting auto-assignment for ticket ${ticketId}`);

      const tecnicoId = await asignacionService.executeRules({
        id: ticketId,
        clienteId,
      });

      if (tecnicoId) {
        await db
          .update(tickets)
          .set({ tecnicoAsignadoId: tecnicoId, updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));

        // Also update the reactivo's tecnicoId so it appears on the technician's Kanban
        const ticketResult = await db
          .select({ reactivoId: tickets.reactivoId })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1);

        if (ticketResult[0]?.reactivoId) {
          const { reactivos } = await import('../../db/schema/reactivos.js');
          await db
            .update(reactivos)
            .set({ tecnicoId, updatedAt: new Date() })
            .where(eq(reactivos.id, ticketResult[0].reactivoId));
        }

        job.log(`Ticket ${ticketId} assigned to tecnico ${tecnicoId}`);
      } else {
        job.log(`No matching rule found for ticket ${ticketId}`);
      }
    },
    { connection, concurrency: 5 },
  );

  assignmentWorker.on('failed', (job, err) => {
    console.error(
      `[AssignmentWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      err.message,
    );
  });

  assignmentWorker.on('completed', (job) => {
    console.log(`[AssignmentWorker] Job ${job.id} completed`);
  });

  return assignmentWorker;
}

/**
 * Gracefully close the assignment worker.
 */
export async function closeAssignmentWorker(): Promise<void> {
  await assignmentWorker?.close();
  assignmentWorker = null;
}
