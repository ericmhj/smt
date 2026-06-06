export enum DocumentoErrorCode {
  NOT_FOUND = 'DOCUMENTO_NOT_FOUND',
  FILE_TOO_LARGE = 'DOCUMENTO_FILE_TOO_LARGE',
  INVALID_FORMAT = 'DOCUMENTO_INVALID_FORMAT',
}

export class DocumentoError extends Error {
  constructor(
    public statusCode: number,
    public code: DocumentoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentoError';
  }
}
