import { z } from 'zod';

// ─── Cliente Schemas ────────────────────────────────────────────────────────

export const createClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
  empresa: z.string().min(1).max(255).optional(),
  email: z.string().email('Formato de email inválido'),
  telefono: z
    .string()
    .regex(/^\+?[\d\s\-]{7,15}$/, 'Formato de teléfono inválido (7-15 dígitos)')
    .optional(),
  direccion: z.string().max(500).optional(),
  industria: z.string().max(100).optional(),
  etiquetas: z
    .array(z.string().max(50))
    .max(20, 'Máximo 20 etiquetas permitidas')
    .optional(),
});

export const updateClienteSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  empresa: z.string().min(1).max(255).optional(),
  email: z.string().email('Formato de email inválido').optional(),
  telefono: z
    .string()
    .regex(/^\+?[\d\s\-]{7,15}$/, 'Formato de teléfono inválido (7-15 dígitos)')
    .optional(),
  direccion: z.string().max(500).nullish(),
  industria: z.string().max(100).nullish(),
  etiquetas: z
    .array(z.string().max(50))
    .max(20, 'Máximo 20 etiquetas permitidas')
    .optional(),
});

// ─── Contacto Schemas ───────────────────────────────────────────────────────

export const createContactoSchema = z.object({
  nombre: z.string().min(1, 'El nombre del contacto es obligatorio').max(255),
  email: z.string().email('Formato de email inválido').optional(),
  telefono: z.string().max(30).optional(),
  cargo: z.string().max(100).optional(),
  esPrincipal: z.boolean().optional(),
});

export const updateContactoSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  email: z.string().email('Formato de email inválido').optional(),
  telefono: z.string().max(30).optional(),
  cargo: z.string().max(100).optional(),
  esPrincipal: z.boolean().optional(),
});

// ─── Filter & Query Schemas ─────────────────────────────────────────────────

export const clienteFiltersSchema = z.object({
  industria: z.string().optional(),
  etiquetas: z.string().optional(), // comma-separated
  asignadoA: z.string().uuid().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  activo: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'El término de búsqueda es obligatorio'),
  industria: z.string().optional(),
  etiquetas: z.string().optional(),
  asignadoA: z.string().uuid().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  activo: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val === 'boolean') return val;
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Param Schemas ──────────────────────────────────────────────────────────

export const clienteIdParamSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
});

export const contactoIdParamSchema = z.object({
  contactoId: z.string().uuid('contactoId debe ser un UUID válido'),
});

export const tagParamSchema = z.object({
  tag: z.string().min(1, 'La etiqueta es obligatoria').max(50),
});

// ─── Type exports ───────────────────────────────────────────────────────────

export type CreateClienteInput = z.infer<typeof createClienteSchema>;
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
export type CreateContactoInput = z.infer<typeof createContactoSchema>;
export type UpdateContactoInput = z.infer<typeof updateContactoSchema>;
export type ClienteFiltersInput = z.infer<typeof clienteFiltersSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
