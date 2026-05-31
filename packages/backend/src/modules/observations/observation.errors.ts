export enum ObservationErrorCode {
  NOT_FOUND = 'OBS_001',
  EMPTY_CONTENT = 'OBS_002',
  FILE_TOO_LARGE = 'OBS_003',
  INVALID_FORMAT = 'OBS_004',
  MALWARE_DETECTED = 'OBS_005',
  REACTIVO_NOT_FOUND = 'OBS_006',
  UNAUTHORIZED = 'OBS_007',
  FILE_NOT_FOUND = 'OBS_008',
}

export class ObservationError extends Error {
  constructor(
    public statusCode: number,
    public code: ObservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ObservationError';
  }
}
