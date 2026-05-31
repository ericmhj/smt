import { z } from 'zod';

const roleValues = ['superusuario', 'admin', 'manager', 'tecnico', 'tecnico_de_campo'] as const;

export const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().min(1, 'El nombre es requerido').max(255),
  role: z.enum(roleValues, { errorMap: () => ({ message: 'Rol inválido' }) }),
});

export const updateUserSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
  name: z.string().min(1, 'El nombre es requerido').max(255).optional(),
  role: z.enum(roleValues, { errorMap: () => ({ message: 'Rol inválido' }) }).optional(),
});

export const userFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(roleValues).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserFiltersInput = z.infer<typeof userFiltersSchema>;
