import { z } from 'zod';

export const createReactivoSchema = z.object({
  formId: z.string().uuid('formId debe ser un UUID válido'),
  responses: z.record(z.string(), z.unknown()),
});

export const reapplyReactivoSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
});

export const submitReactivoSchema = z.object({
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

export const puntoFueraCumplimientoSchema = z.object({
  puntoId: z.number().int().positive('puntoId debe ser un entero positivo'),
  area: z.string().min(1, 'area es requerido'),
  zona: z.string().min(1, 'zona es requerido'),
  tipoPunto: z.enum(['nocturno', 'natural']),
  criterioFallido: z.enum(['iluminancia', 'kf', 'ambos']),
  valorMedido: z.number(),
  valorLimite: z.number(),
  incertidumbre: z.number(),
});

export const createComplementaryStudySchema = z.object({
  puntosFallidos: z
    .array(puntoFueraCumplimientoSchema)
    .min(1, 'Debe haber al menos un punto fuera de cumplimiento'),
  tecnicoAsignadoId: z.string().uuid('tecnicoAsignadoId debe ser UUID válido').optional(),
});

export type CreateReactivoInput = z.infer<typeof createReactivoSchema>;
export type ReapplyReactivoInput = z.infer<typeof reapplyReactivoSchema>;
export type ReactivoIdParam = z.infer<typeof reactivoIdParamSchema>;
export type MyReactivosQuery = z.infer<typeof myReactivosQuerySchema>;
export type CreateComplementaryStudyInput = z.infer<typeof createComplementaryStudySchema>;
