import { z } from 'zod';

// ─── Cliente Schemas ────────────────────────────────────────────────────────

export const createClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
  empresa: z.string().max(255).optional(),
  rfc: z.string().min(10, 'RFC debe tener al menos 10 caracteres').max(20, 'RFC máximo 20 caracteres'),
  email: z.string().email('Formato de email inválido'),
  telefono: z.string().min(7, 'Teléfono inválido').max(30),
  direccionCentroTrabajo: z.string().min(1, 'El domicilio es obligatorio').max(500),
  actividadPrincipal: z.string().min(1, 'La actividad principal es obligatoria').max(255),
  contacto: z.string().min(1, 'El contacto es obligatorio').max(255),
  horarios: z.string().min(1, 'Los horarios son obligatorios').max(255),
  industria: z.string().max(100).optional(),
  etiquetas: z
    .array(z.string().max(50))
    .max(20, 'Máximo 20 etiquetas permitidas')
    .optional(),
});

export const updateClienteSchema = z.object({
  nombre: z.string().min(1).max(255).optional(),
  empresa: z.string().max(255).optional(),
  rfc: z.string().min(10).max(20).optional(),
  email: z.string().email('Formato de email inválido').optional(),
  telefono: z.string().min(7).max(30).optional(),
  direccionCentroTrabajo: z.string().min(1).max(500).optional(),
  actividadPrincipal: z.string().min(1).max(255).optional(),
  contacto: z.string().min(1).max(255).optional(),
  horarios: z.string().min(1).max(255).optional(),
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
