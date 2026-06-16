export interface CreateClienteDTO {
  nombre: string;
  empresa?: string;
  rfc: string;
  email: string;
  telefono: string;
  direccionCentroTrabajo: string;
  actividadPrincipal: string;
  contacto: string;
  horarios: string;
  industria?: string;
  etiquetas?: string[];
}

export interface UpdateClienteDTO {
  nombre?: string;
  empresa?: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  direccionCentroTrabajo?: string;
  actividadPrincipal?: string;
  contacto?: string;
  horarios?: string;
  industria?: string | null;
  etiquetas?: string[];
}

export interface ClienteResponse {
  id: string;
  nombre: string;
  empresa: string | null;
  rfc: string;
  email: string;
  telefono: string;
  direccionCentroTrabajo: string;
  actividadPrincipal: string;
  contacto: string;
  horarios: string;
  industria: string | null;
  etiquetas: string[];
  asignadoA: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactoResponse {
  id: string;
  clienteId: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  esPrincipal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentoResumen {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketResumen {
  id: string;
  estado: string;
  prioridad: string;
  createdAt: string;
}

export interface ClienteDetalle extends ClienteResponse {
  contactos: ContactoResponse[];
  documentos: DocumentoResumen[];
  tickets: TicketResumen[];
}

export interface ClienteFilters {
  industria?: string;
  etiquetas?: string[];
  asignadoA?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  activo?: boolean;
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

export interface CreateContactoDTO {
  nombre: string;
  email?: string;
  telefono?: string;
  cargo?: string;
  esPrincipal?: boolean;
}

export interface UpdateContactoDTO {
  nombre?: string;
  email?: string;
  telefono?: string;
  cargo?: string;
  esPrincipal?: boolean;
}
