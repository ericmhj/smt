export type ReactivoState =
  | 'pendiente'
  | 'en_revision'
  | 'validado'
  | 'rechazado'
  | 'finalizado';

export interface CreateReactivoDTO {
  formId: string;
  responses: Record<string, unknown>;
}

export interface ReapplyReactivoDTO {
  responses: Record<string, unknown>;
}

export interface ReactivoResponse {
  id: string;
  formId: string;
  formVersionId: string;
  tecnicoId: string;
  parentReactivoId: string | null;
  attemptNumber: number;
  state: ReactivoState;
  responses: Record<string, unknown>;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  formName?: string;
}

export interface ReactivoDetailResponse extends ReactivoResponse {
  form: {
    id: string;
    name: string;
    slug: string;
  };
  tecnico: {
    id: string;
    name: string;
    email: string;
  };
  stateTransitions: StateTransitionResponse[];
}

export interface StateTransitionResponse {
  id: string;
  reactivoId: string;
  fromState: ReactivoState;
  toState: ReactivoState;
  actorId: string;
  signatureId: string;
  reason: string | null;
  createdAt: string;
}

export interface TransitionInput {
  toState: ReactivoState;
  signatureId: string;
  reason?: string;
  ipAddress: string;
}

export interface ReactivoFilters {
  page?: number;
  pageSize?: number;
  state?: ReactivoState;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Estudio Complementario de Cumplimiento ────────────────────────────────

export interface PuntoFueraCumplimiento {
  puntoId: number;
  area: string;
  zona: string;
  tipoPunto: 'nocturno' | 'natural';
  criterioFallido: 'iluminancia' | 'kf' | 'ambos';
  valorMedido: number;
  valorLimite: number;
  incertidumbre: number;
}

export interface CreateComplementaryStudyDTO {
  puntosFallidos: PuntoFueraCumplimiento[];
  tecnicoAsignadoId?: string;
}

export interface ComplementaryStudyMetadata {
  tipo: 'complementario_cumplimiento';
  formularioOrigenId: string;
  informeOrigenNo: string;
  anotacion: string;
  puntosFallidos: PuntoFueraCumplimiento[];
  fechaCreacion: string;
  bloqueadoHasta: string; // ISO date — tarjeta bloqueada durante 3 días hábiles post-creación
}

export interface ComplementaryStudyResponse extends ReactivoResponse {
  metadata: ComplementaryStudyMetadata;
  ticketId: string;
  ticketIdentificador: string;
}
