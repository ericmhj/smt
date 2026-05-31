import type { ReactivoState } from '../reactivos/reactivo.types.js';

export interface KanbanCard {
  id: string;
  formName: string;
  tecnicoName: string;
  attemptNumber: number;
  state: ReactivoState;
  createdAt: string;
  unreadObservations: number;
}

export interface KanbanColumn {
  state: ReactivoState;
  label: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
}

export interface KanbanFilters {
  tecnicoId?: string;
  formId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TransitionDTO {
  toState: ReactivoState;
  signatureId: string;
  reason?: string;
}

export const COLUMN_LABELS: Record<ReactivoState, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En Revisión',
  validado: 'Validado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};
