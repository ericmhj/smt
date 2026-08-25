export enum ReactivoErrorCode {
  REACTIVO_NOT_FOUND = 'REACTIVO_001',
  FORM_NOT_ASSIGNED = 'REACTIVO_002',
  INVALID_RESPONSES = 'REACTIVO_003',
  INVALID_STATE_TRANSITION = 'REACTIVO_004',
  PARENT_NOT_REJECTED = 'REACTIVO_005',
  NOT_OWNER = 'REACTIVO_006',
  FORM_NOT_FOUND = 'REACTIVO_007',
  VERSION_NOT_FOUND = 'REACTIVO_008',
  SIGNATURE_REQUIRED = 'REACTIVO_009',
  REASON_REQUIRED = 'REACTIVO_010',
  UNAUTHORIZED_ROLE = 'REACTIVO_011',
  INVALID_STATE_FOR_SUBMIT = 'REACTIVO_012',
  VALIDATION_RULES_FAILED = 'VALIDATION_RULES_FAILED',
  NOT_FINALIZED = 'REACTIVO_013',
  NO_FAILED_POINTS = 'REACTIVO_014',
}

export class ReactivoError extends Error {
  public details?: unknown;

  constructor(
    public statusCode: number,
    public code: ReactivoErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ReactivoError';
    this.details = details;
  }
}
