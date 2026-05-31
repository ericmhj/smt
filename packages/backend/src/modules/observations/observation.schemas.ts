import { z } from 'zod';

export const createObservationBodySchema = z.object({
  content: z.string().min(1, 'El contenido es obligatorio'),
});

export const reactivoIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const observationIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const fileIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
  fileId: z.string().uuid('fileId debe ser un UUID válido'),
});

export type CreateObservationBody = z.infer<typeof createObservationBodySchema>;
export type ReactivoIdParam = z.infer<typeof reactivoIdParamSchema>;
export type ObservationIdParam = z.infer<typeof observationIdParamSchema>;
export type FileIdParam = z.infer<typeof fileIdParamSchema>;
