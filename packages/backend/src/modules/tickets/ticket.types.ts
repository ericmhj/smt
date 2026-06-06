export type TicketEstado = 'pendiente' | 'en_revision' | 'validado' | 'rechazado' | 'finalizado';
export type TicketPrioridad = 'alta' | 'media' | 'baja';

export const TICKET_VALID_TRANSITIONS: Record<TicketEstado, TicketEstado[]> = {
  pendiente: ['en_revision'],
  en_revision: ['validado', 'rechazado'],
  validado: ['finalizado'],
  rechazado: [],
  finalizado: [],
};

export interface CreateTicketDTO {
  clienteId: string;
  formId: string;
  tecnicoAsignadoId?: string;
  prioridad: TicketPrioridad;
}

export interface TicketFilters {
  clienteId?: string;
  tecnicoAsignadoId?: string;
  estado?: TicketEstado;
  prioridad?: string;
  vencido?: boolean;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TicketResponse {
  id: string;
  clienteId: string;
  formId: string;
  tecnicoAsignadoId: string | null;
  reactivoId: string | null;
  prioridad: string;
  slaHoras: number;
  estado: string;
  fechaLimite: string;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetalle extends TicketResponse {
  clienteNombre?: string;
  formNombre?: string;
  tecnicoNombre?: string;
}
