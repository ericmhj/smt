import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Database } from '../../db/index.js';
import { clienteDocumentos, clientes } from '../../db/schema/clientes.js';
import { uploadFile, getFileUrl, deleteFile } from '../../lib/minio.js';
import { sanitizeFilename } from '../../lib/tenant-schema.js';
import { DocumentoError, DocumentoErrorCode } from './documento.errors.js';
import { ClienteError, ClienteErrorCode } from './cliente.errors.js';
import { FileValidation } from '../observations/file-validation.js';
import type { JWTPayload } from '../auth/auth.types.js';

export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export interface DocumentoResponse {
  id: string;
  clienteId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export class DocumentoService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async upload(
    clienteId: string,
    file: UploadedFile,
    actor: JWTPayload,
  ): Promise<DocumentoResponse> {
    // Verify client exists
    await this.assertClienteExists(clienteId);

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new DocumentoError(
        400,
        DocumentoErrorCode.FILE_TOO_LARGE,
        `El archivo excede el tamaño máximo permitido de 10 MB`,
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new DocumentoError(
        400,
        DocumentoErrorCode.INVALID_FORMAT,
        `Formato de archivo no permitido. Formatos aceptados: PDF, JPG, PNG, DOC, DOCX`,
      );
    }

    // Scan for malware (fail-closed)
    const scanResult = await FileValidation.scanForMalware(file.buffer);
    if (!scanResult.clean) {
      throw new DocumentoError(
        400,
        DocumentoErrorCode.INVALID_FORMAT,
        `Archivo rechazado por seguridad: ${scanResult.threat}`,
      );
    }

    // Generate storage key
    const uuid = randomUUID();
    const safeName = sanitizeFilename(file.originalName);
    const storageKey = `clientes/${clienteId}/docs/${uuid}-${safeName}`;

    // Upload to S3
    await uploadFile(storageKey, file.buffer, file.mimeType);

    // Create DB record
    const result = await this.db
      .insert(clienteDocumentos)
      .values({
        clienteId,
        originalName: file.originalName,
        storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.size,
        uploadedBy: actor.sub,
      })
      .returning();

    const doc = result[0]!;
    return this.toResponse(doc);
  }

  async list(clienteId: string): Promise<DocumentoResponse[]> {
    await this.assertClienteExists(clienteId);

    const docs = await this.db
      .select()
      .from(clienteDocumentos)
      .where(eq(clienteDocumentos.clienteId, clienteId));

    return docs.map((d) => this.toResponse(d));
  }

  async getDownloadUrl(documentoId: string): Promise<string> {
    const doc = await this.findById(documentoId);
    if (!doc) {
      throw new DocumentoError(
        404,
        DocumentoErrorCode.NOT_FOUND,
        'Documento no encontrado',
      );
    }

    return getFileUrl(doc.storageKey);
  }

  async delete(documentoId: string, _actor: JWTPayload): Promise<void> {
    const doc = await this.findById(documentoId);
    if (!doc) {
      throw new DocumentoError(
        404,
        DocumentoErrorCode.NOT_FOUND,
        'Documento no encontrado',
      );
    }

    // Delete from S3
    await deleteFile(doc.storageKey);

    // Delete from DB
    await this.db
      .delete(clienteDocumentos)
      .where(eq(clienteDocumentos.id, documentoId));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async findById(id: string) {
    const result = await this.db
      .select()
      .from(clienteDocumentos)
      .where(eq(clienteDocumentos.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  private async assertClienteExists(clienteId: string): Promise<void> {
    const result = await this.db
      .select({ id: clientes.id })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1);

    if (result.length === 0) {
      throw new ClienteError(
        404,
        ClienteErrorCode.NOT_FOUND,
        'Cliente no encontrado',
      );
    }
  }

  private toResponse(row: typeof clienteDocumentos.$inferSelect): DocumentoResponse {
    return {
      id: row.id,
      clienteId: row.clienteId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
