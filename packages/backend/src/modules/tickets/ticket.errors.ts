export enum TicketErrorCode {
  NOT_FOUND = 'TICKET_NOT_FOUND',
  INVALID_TRANSITION = 'TICKET_INVALID_TRANSITION',
  REASSIGN_NOT_ALLOWED = 'TICKET_REASSIGN_NOT_ALLOWED',
  SLA_NOT_CONFIGURED = 'TICKET_SLA_NOT_CONFIGURED',
}

export class TicketError extends Error {
  constructor(
    public statusCode: number,
    public code: TicketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TicketError';
  }
}
