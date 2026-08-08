/**
 * Calculation Rule Template Routes - CRUD for platform-level calculation rules.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/index.js';
import { calculationRuleTemplates } from '../../db/schema/index.js';
import { insertAuditLog } from '../validation/audit-helper.js';

const createCalcRuleSchema = z.object({
  form_type: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  calculations: z.array(z.object({
    sectionName: z.string().min(1),
    scope: z.enum(['section', 'per_row']),
    rowPattern: z.string().optional(),
    rules: z.array(z.object({
      targetField: z.string().min(1),
      formula: z.string().min(1),
      label: z.string().optional(),
      precision: z.number().int().min(0).max(10).optional(),
      type: z.enum(['arithmetic', 'conditional', 'aggregate']).optional(),
    })).min(1),
  })).min(1),
});

const updateCalcRuleSchema = createCalcRuleSchema.partial();

export async function calculationRuleRoutes(
  fastify: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  const { db } = opts;

  // GET /api/calculation-rules
  fastify.get('/api/calculation-rules', async (request, reply) => {
    const { form_type } = request.query as { form_type?: string };

    let rules;
    if (form_type) {
      rules = await db.select().from(calculationRuleTemplates)
        .where(eq(calculationRuleTemplates.formType, form_type));
    } else {
      rules = await db.select().from(calculationRuleTemplates);
    }

    return reply.status(200).send(rules);
  });

  // POST /api/calculation-rules
  fastify.post('/api/calculation-rules', async (request, reply) => {
    const parseResult = createCalcRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    try {
      const [result] = await db.insert(calculationRuleTemplates).values({
        formType: parseResult.data.form_type,
        name: parseResult.data.name,
        description: parseResult.data.description || null,
        calculations: parseResult.data.calculations,
        createdBy: request.user?.sub || null,
      }).returning();

      await insertAuditLog(db, request, {
        action: 'create',
        entityType: 'rule_template',
        entityId: result.id,
        details: { type: 'calculation', name: result.name, form_type: result.formType },
      });

      return reply.status(201).send(result);
    } catch (error: any) {
      if (error?.code === '23505') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'DUPLICATE_RULE_NAME',
          message: `Ya existe una regla de cálculo "${parseResult.data.name}" para form_type "${parseResult.data.form_type}"`,
        });
      }
      throw error;
    }
  });

  // GET /api/calculation-rules/:id
  fastify.get('/api/calculation-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [rule] = await db.select().from(calculationRuleTemplates)
      .where(eq(calculationRuleTemplates.id, id));

    if (!rule) return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Regla no encontrada' });
    return reply.status(200).send(rule);
  });

  // PUT /api/calculation-rules/:id
  fastify.put('/api/calculation-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updateCalcRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parseResult.error.flatten().fieldErrors });
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parseResult.data.form_type) updateValues.formType = parseResult.data.form_type;
    if (parseResult.data.name) updateValues.name = parseResult.data.name;
    if (parseResult.data.description !== undefined) updateValues.description = parseResult.data.description || null;
    if (parseResult.data.calculations) updateValues.calculations = parseResult.data.calculations;
    updateValues.updatedBy = request.user?.sub || null;

    const [updated] = await db.update(calculationRuleTemplates)
      .set(updateValues)
      .where(eq(calculationRuleTemplates.id, id))
      .returning();

    if (!updated) return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Regla no encontrada' });
    return reply.status(200).send(updated);
  });

  // DELETE /api/calculation-rules/:id
  fastify.delete('/api/calculation-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deletedResult = await db.delete(calculationRuleTemplates)
      .where(eq(calculationRuleTemplates.id, id))
      .returning();

    if (deletedResult.length === 0) return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND' });
    return reply.status(204).send();
  });

  // PATCH /api/calculation-rules/:id/toggle
  fastify.patch('/api/calculation-rules/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await db.select().from(calculationRuleTemplates)
      .where(eq(calculationRuleTemplates.id, id));

    if (!existing) return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND' });

    const [updated] = await db.update(calculationRuleTemplates)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(calculationRuleTemplates.id, id))
      .returning();

    return reply.status(200).send(updated);
  });
}
