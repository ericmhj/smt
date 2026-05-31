import type { ReactivoState, TransitionInput } from './reactivo.types.js';

/**
 * Valid state transitions (unidirectional state machine).
 * Terminal states: 'rechazado' and 'finalizado' have no outgoing transitions.
 */
export const VALID_TRANSITIONS: Record<ReactivoState, ReactivoState[]> = {
  pendiente: ['en_revision'],
  en_revision: ['validado', 'rechazado'],
  validado: ['finalizado'],
  rechazado: [], // Terminal state
  finalizado: [], // Terminal state
};

/**
 * Returns true if the transition from `fromState` to `toState` is valid
 * according to the state machine definition.
 */
export function canTransition(fromState: ReactivoState, toState: ReactivoState): boolean {
  const validTargets = VALID_TRANSITIONS[fromState];
  if (!validTargets) {
    return false;
  }
  return validTargets.includes(toState);
}

export interface TransitionValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a full transition including business rules:
 * - The transition must be valid in the state machine
 * - All transitions require a signature reference (signatureId)
 * - Transitions to 'rechazado' require a non-empty reason
 */
export function validateTransition(
  fromState: ReactivoState,
  input: TransitionInput,
): TransitionValidationResult {
  // Check if transition is valid in the state machine
  if (!canTransition(fromState, input.toState)) {
    return {
      valid: false,
      error: `Transición inválida: no se puede pasar de '${fromState}' a '${input.toState}'`,
    };
  }

  // All transitions require a signature
  if (!input.signatureId || input.signatureId.trim() === '') {
    return {
      valid: false,
      error: 'Toda transición requiere una firma digital válida',
    };
  }

  // Transitions to 'rechazado' require a reason
  if (input.toState === 'rechazado') {
    if (!input.reason || input.reason.trim() === '') {
      return {
        valid: false,
        error: 'La transición a estado rechazado requiere un motivo',
      };
    }
  }

  return { valid: true };
}
