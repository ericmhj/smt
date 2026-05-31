export enum UserErrorCode {
  USER_NOT_FOUND = 'USER_001',
  EMAIL_ALREADY_EXISTS = 'USER_002',
  INSUFFICIENT_PERMISSIONS = 'USER_003',
  CANNOT_MODIFY_SUPERUSUARIO = 'USER_004',
  CANNOT_MANAGE_ROLE = 'USER_005',
  CANNOT_DELETE_SELF = 'USER_006',
}

export class UserError extends Error {
  constructor(
    public statusCode: number,
    public code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}
