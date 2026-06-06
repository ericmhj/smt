export enum ClienteErrorCode {
  NOT_FOUND = 'CLIENTE_NOT_FOUND',
  EMAIL_EXISTS = 'CLIENTE_EMAIL_EXISTS',
  PHONE_EXISTS = 'CLIENTE_PHONE_EXISTS',
  FORBIDDEN = 'CLIENTE_FORBIDDEN',
  INVALID_TAG = 'CLIENTE_INVALID_TAG',
}

export class ClienteError extends Error {
  constructor(
    public statusCode: number,
    public code: ClienteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClienteError';
  }
}
