export interface CreateObservationInput {
  reactivoId: string;
  content: string;
}

export interface ObservationFileRecord {
  id: string;
  observationId: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  createdAt: string;
}

export interface ObservationRecord {
  id: string;
  reactivoId: string;
  authorId: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  files: ObservationFileRecord[];
}

export interface FileUploadData {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
