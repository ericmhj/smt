export interface SignatureInput {
  type: 'upload' | 'canvas';
  imageData: Buffer;
}

export interface SignatureRecord {
  id: string;
  userId: string;
  type: 'upload' | 'canvas';
  imageHash: string;
  hmac: string;
  createdAt: string;
}

export interface VerifyResult {
  valid: boolean;
  details?: string;
}
