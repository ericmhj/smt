export type Role = 'superusuario' | 'admin' | 'manager' | 'tecnico' | 'asistente';

export type ReactivoState =
  | 'pendiente'
  | 'en_revision'
  | 'validado'
  | 'rechazado'
  | 'finalizado';

export type SignatureType = 'upload' | 'canvas';

export type NotificationType =
  | 'state_change'
  | 'observation'
  | 'assignment'
  | 'rejection';
