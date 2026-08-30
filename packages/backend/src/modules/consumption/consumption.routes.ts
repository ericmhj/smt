import type { FastifyInstance } from 'fastify';
import { ConsumptionAccountService } from './consumption.service.js';
import { requireRole } from '../users/rbac.middleware.js';
import type { Database } from '../../db/index.js';

export async function consumptionRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const service = new ConsumptionAccountService(opts.db);
  const adminManagerRole = requireRole(['superusuario', 'admin', 'manager']);

  /**
   * GET /api/consumption/balance
   * Returns the current credit balance for the tenant.
   * Read-only — balance is updated exclusively via Kafka from license-service.
   */
  fastify.get(
    '/api/consumption/balance',
    { preHandler: [adminManagerRole] },
    async (request, reply) => {
      const tenantId = request.tenantContext?.tenantId;
      if (!tenantId) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'TENANT_REQUIRED',
          message: 'No se pudo determinar el tenant',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const balance = await service.getBalance(tenantId);

      if (!balance) {
        return reply.status(200).send({
          saldoCreditos: 0,
          creditosTotalesAdquiridos: 0,
          ultimoSync: null,
          message: 'Cuenta de consumo no inicializada. Se creará al recibir el primer movimiento del módulo de licencias.',
        });
      }

      return reply.status(200).send(balance);
    },
  );

  /**
   * GET /api/consumption/history
   * Returns paginated ledger history for the tenant.
   * Supports filters: tipo, desde, hasta, page, pageSize.
   */
  fastify.get(
    '/api/consumption/history',
    { preHandler: [adminManagerRole] },
    async (request, reply) => {
      const tenantId = request.tenantContext?.tenantId;
      if (!tenantId) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'TENANT_REQUIRED',
          message: 'No se pudo determinar el tenant',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        });
      }

      const query = request.query as Record<string, string | undefined>;

      const filters = {
        tipo: query.tipo,
        desde: query.desde,
        hasta: query.hasta,
        page: query.page ? parseInt(query.page, 10) : 1,
        pageSize: query.pageSize ? Math.min(parseInt(query.pageSize, 10), 100) : 20,
      };

      const result = await service.getHistory(tenantId, filters);
      return reply.status(200).send(result);
    },
  );
}
