import { z } from 'zod';

// ─── Ticket Schemas ─────────────────────────────────────────────────────────

export const createTicketSchema = z.object({
  clienteId: z.string().uuid('clienteId debe ser un UUID válido'),
  formId: z.string().uuid('formId debe ser un UUID válido'),
  tecnicoAsignadoId: z.string().uuid('tecnicoAsignadoId debe ser un UUID válido').optional(),
  prioridad: z.enum(['alta', 'media', 'baja'], {
    errorMap: () => ({ message: 'Prioridad debe ser alta, media o baja' }),
  }),
});

export const ticketTransitionSchema = z.object({
  estado: z.enum(['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado'], {
    errorMap: () => ({ message: 'Estado inválido' }),
  }),
});

export const ticketFiltersSchema = z.object({
  clienteId: z.string().uuid().optional(),
  tecnicoAsignadoId: z.string().uuid().optional(),
  estado: z.enum(['pendiente', 'en_revision', 'validado', 'rechazado', 'finalizado']).optional(),
  prioridad: z.enum(['alta', 'media', 'baja']).optional(),
  vencido: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Reglas de Asignación ───────────────────────────────────────────────────

export const createReglaAsignacionSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
  tipo: z.enum(['ubicacion', 'carga'], {
    errorMap: () => ({ message: 'Tipo debe ser ubicacion o carga' }),
  }),
  condiciones: z.record(z.unknown()),
  activo: z.boolean().optional().default(true),
});

export const updateReglaAsignacionSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  tipo: z.enum(['ubicacion', 'carga']).optional(),
  condiciones: z.record(z.unknown()).optional(),
  activo: z.boolean().optional(),
});

// ─── SLA Config ─────────────────────────────────────────────────────────────

export const updateSLAConfigSchema = z.object({
  horasLimite: z.number().int().min(1, 'Horas límite debe ser al menos 1'),
});

// ─── Param Schemas ──────────────────────────────────────────────────────────

export const ticketIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const reglaIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const prioridadParamSchema = z.object({
  prioridad: z.enum(['alta', 'media', 'baja']),
});

export const tecnicoBodySchema = z.object({
  tecnicoId: z.string().uuid('tecnicoId debe ser un UUID válido'),
});

export const reactivoBodySchema = z.object({
  reactivoId: z.string().uuid('reactivoId debe ser un UUID válido'),
});

// ─── Type exports ───────────────────────────────────────────────────────────

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type TicketTransitionInput = z.infer<typeof ticketTransitionSchema>;
export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;
export type CreateReglaAsignacionInput = z.infer<typeof createReglaAsignacionSchema>;
export type UpdateReglaAsignacionInput = z.infer<typeof updateReglaAsignacionSchema>;
export type UpdateSLAConfigInput = z.infer<typeof updateSLAConfigSchema>;
