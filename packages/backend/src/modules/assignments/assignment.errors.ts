export enum AssignmentErrorCode {
  FORM_NOT_FOUND = 'ASSIGN_001',
  FORM_INACTIVE = 'ASSIGN_002',
  TECNICO_NOT_FOUND = 'ASSIGN_003',
  TECNICO_INVALID_ROLE = 'ASSIGN_004',
  DUPLICATE_ASSIGNMENT = 'ASSIGN_005',
  ASSIGNMENT_NOT_FOUND = 'ASSIGN_006',
}

export class AssignmentError extends Error {
  constructor(
    public statusCode: number,
    public code: AssignmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssignmentError';
  }
}
