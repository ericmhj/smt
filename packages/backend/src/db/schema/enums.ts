import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', [
  'superusuario',
  'admin',
  'manager',
  'tecnico',
]);

export const reactivoStateEnum = pgEnum('reactivo_state', [
  'pendiente',
  'en_revision',
  'validado',
  'rechazado',
  'finalizado',
]);

export const signatureTypeEnum = pgEnum('signature_type', ['upload', 'canvas']);

export const notificationTypeEnum = pgEnum('notification_type', [
  'state_change',
  'observation',
  'assignment',
  'rejection',
]);
