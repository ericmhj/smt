import { z } from 'zod';

export const assignFormSchema = z.object({
  formId: z.string().uuid('formId debe ser un UUID válido'),
  tecnicoId: z.string().uuid('tecnicoId debe ser un UUID válido'),
});

export const assignmentIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export type AssignFormInput = z.infer<typeof assignFormSchema>;
export type AssignmentIdParam = z.infer<typeof assignmentIdParamSchema>;
