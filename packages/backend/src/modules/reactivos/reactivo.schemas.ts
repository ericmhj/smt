import { z } from 'zod';

export const createReactivoSchema = z.object({
  formId: z.string().uuid('formId debe ser un UUID válido'),
  responses: z.record(z.string(), z.unknown()),
});

export const reapplyReactivoSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
});

export const reactivoIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const myReactivosQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive()),
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  state: z
    .enum(['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado'])
    .optional(),
});

export type CreateReactivoInput = z.infer<typeof createReactivoSchema>;
export type ReapplyReactivoInput = z.infer<typeof reapplyReactivoSchema>;
export type ReactivoIdParam = z.infer<typeof reactivoIdParamSchema>;
export type MyReactivosQuery = z.infer<typeof myReactivosQuerySchema>;
