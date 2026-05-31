import { z } from 'zod';

export const signatureTypeSchema = z.enum(['upload', 'canvas']);

export const signatureIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export type SignatureIdParam = z.infer<typeof signatureIdParamSchema>;
