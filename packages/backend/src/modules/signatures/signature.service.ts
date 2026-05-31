import { createHash, createHmac } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { signatures } from '../../db/schema/signatures.js';
import { SignatureError, SignatureErrorCode } from './signature.errors.js';
import type { SignatureInput, SignatureRecord, VerifyResult } from './signature.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class SignatureService {
  private db: Database;
  private hmacSecret: string;

  constructor(db: Database) {
    this.db = db;
    const secret = process.env.SIGNATURE_HMAC_SECRET;
    if (!secret) {
      throw new SignatureError(
        500,
        SignatureErrorCode.HMAC_SECRET_MISSING,
        'SIGNATURE_HMAC_SECRET no está configurado',
      );
    }
    this.hmacSecret = secret;
  }

  /**
   * Capture and store a digital signature.
   */
  async capture(input: SignatureInput, actor: JWTPayload): Promise<SignatureRecord> {
    if (!input.imageData || input.imageData.length === 0) {
      throw new SignatureError(
        400,
        SignatureErrorCode.INVALID_INPUT,
        'La imagen de firma es requerida',
      );
    }

    // Calculate SHA-256 hash of the image
    const imageHash = createHash('sha256').update(input.imageData).digest('hex');

    // Store image as base64 in encrypted_image column (pgcrypto encryption at DB level later)
    const imageBuffer = input.imageData;

    // Generate HMAC of the record (imageHash + userId + timestamp)
    const timestamp = new Date().toISOString();
    const hmacData = `${imageHash}:${actor.sub}:${timestamp}`;
    const hmac = createHmac('sha256', this.hmacSecret).update(hmacData).digest('hex');

    // Insert into database
    const result = await this.db
      .insert(signatures)
      .values({
        userId: actor.sub,
        type: input.type,
        encryptedImage: imageBuffer,
        imageHash,
        hmac,
      })
      .returning();

    const record = result[0]!;

    return {
      id: record.id,
      userId: record.userId,
      type: record.type as 'upload' | 'canvas',
      imageHash: record.imageHash,
      hmac: record.hmac,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Verify the integrity of a stored signature.
   */
  async verify(signatureId: string): Promise<VerifyResult> {
    const result = await this.db
      .select()
      .from(signatures)
      .where(eq(signatures.id, signatureId))
      .limit(1);

    const record = result[0];
    if (!record) {
      throw new SignatureError(
        404,
        SignatureErrorCode.NOT_FOUND,
        'Firma no encontrada',
      );
    }

    // Recalculate SHA-256 from stored image
    const recalculatedHash = createHash('sha256')
      .update(record.encryptedImage)
      .digest('hex');

    if (recalculatedHash !== record.imageHash) {
      return {
        valid: false,
        details: 'El hash de la imagen no coincide. La imagen puede haber sido alterada.',
      };
    }

    // Recalculate HMAC and compare
    const hmacData = `${record.imageHash}:${record.userId}:${record.createdAt.toISOString()}`;
    const recalculatedHmac = createHmac('sha256', this.hmacSecret)
      .update(hmacData)
      .digest('hex');

    if (recalculatedHmac !== record.hmac) {
      return {
        valid: false,
        details: 'El HMAC no coincide. El registro puede haber sido manipulado.',
      };
    }

    return { valid: true };
  }

  /**
   * Get the most recent signature for a user.
   */
  async getByUser(userId: string): Promise<SignatureRecord | null> {
    const result = await this.db
      .select()
      .from(signatures)
      .where(eq(signatures.userId, userId))
      .orderBy(desc(signatures.createdAt))
      .limit(1);

    const record = result[0];
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      userId: record.userId,
      type: record.type as 'upload' | 'canvas',
      imageHash: record.imageHash,
      hmac: record.hmac,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
