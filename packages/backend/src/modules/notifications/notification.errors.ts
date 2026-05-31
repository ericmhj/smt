export enum NotificationErrorCode {
  NOT_FOUND = 'NOTIF_001',
  UNAUTHORIZED = 'NOTIF_002',
  QUEUE_ERROR = 'NOTIF_003',
}

export class NotificationError extends Error {
  statusCode: number;
  code: NotificationErrorCode;

  constructor(statusCode: number, code: NotificationErrorCode, message: string) {
    super(message);
    this.name = 'NotificationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
