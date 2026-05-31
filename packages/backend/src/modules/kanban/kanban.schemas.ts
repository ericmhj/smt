import { z } from 'zod';

export const kanbanBoardQuerySchema = z.object({
  tecnicoId: z.string().uuid('tecnicoId debe ser un UUID válido').optional(),
  formId: z.string().uuid('formId debe ser un UUID válido').optional(),
  dateFrom: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
  dateTo: z.string().datetime({ offset: true }).optional().or(z.string().date().optional()),
});

export const kanbanTransitionBodySchema = z.object({
  toState: z.enum(['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado']),
  signatureId: z.string().uuid('signatureId debe ser un UUID válido'),
  reason: z.string().max(1000).optional(),
});

export const kanbanReactivoIdParamSchema = z.object({
  reactivoId: z.string().uuid('reactivoId debe ser un UUID válido'),
});

export type KanbanBoardQuery = z.infer<typeof kanbanBoardQuerySchema>;
export type KanbanTransitionBody = z.infer<typeof kanbanTransitionBodySchema>;
export type KanbanReactivoIdParam = z.infer<typeof kanbanReactivoIdParamSchema>;
