export enum KanbanErrorCode {
  REACTIVO_NOT_FOUND = 'KANBAN_001',
  INVALID_TRANSITION = 'KANBAN_002',
  UNAUTHORIZED_ROLE = 'KANBAN_003',
  TRANSITION_FAILED = 'KANBAN_004',
}

export class KanbanError extends Error {
  constructor(
    public statusCode: number,
    public code: KanbanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KanbanError';
  }
}
