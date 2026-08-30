import { z } from 'zod';

// Tolerante: acepta valores vacíos y fechas en formato YYYY-MM-DD o ISO.
// Evita respuestas 400 por filtros normales (que el frontend capturaba en
// silencio, vaciando el board y las opciones de filtro).
const optionalNonEmpty = z.string().trim().min(1).optional().or(z.literal('').transform(() => undefined));

export const kanbanBoardQuerySchema = z.object({
  tecnicoId: optionalNonEmpty,
  formId: optionalNonEmpty,
  dateFrom: optionalNonEmpty,
  dateTo: optionalNonEmpty,
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
