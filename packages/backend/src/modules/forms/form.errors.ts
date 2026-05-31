export enum FormErrorCode {
  FORM_NOT_FOUND = 'FORM_001',
  VERSION_NOT_FOUND = 'FORM_002',
  DUPLICATE_FIELD_NAMES = 'FORM_003',
  INVALID_HTML = 'FORM_004',
  SLUG_ALREADY_EXISTS = 'FORM_005',
  NO_FIELDS_FOUND = 'FORM_006',
  FORM_ALREADY_ACTIVE = 'FORM_007',
  FORM_ALREADY_INACTIVE = 'FORM_008',
}

export class FormError extends Error {
  constructor(
    public statusCode: number,
    public code: FormErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FormError';
  }
}
