import { z } from 'zod';

export const createFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(255),
  html: z.string().min(1, 'El HTML es requerido'),
});

export const updateFormSchema = z.object({
  html: z.string().min(1, 'El HTML es requerido'),
  newName: z.string().min(1).max(255).optional(),
});

export const formFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().optional(),
});

export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type FormFiltersInput = z.infer<typeof formFiltersSchema>;
