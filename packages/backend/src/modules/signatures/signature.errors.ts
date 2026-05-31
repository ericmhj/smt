export enum SignatureErrorCode {
  NOT_FOUND = 'SIG_001',
  INTEGRITY_FAILED = 'SIG_002',
  INVALID_INPUT = 'SIG_003',
  HMAC_SECRET_MISSING = 'SIG_004',
}

export class SignatureError extends Error {
  constructor(
    public statusCode: number,
    public code: SignatureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SignatureError';
  }
}
