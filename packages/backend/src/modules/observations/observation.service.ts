import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { observations, observationFiles } from '../../db/schema/observations.js';
import { reactivos } from '../../db/schema/reactivos.js';
import { ObservationError, ObservationErrorCode } from './observation.errors.js';
import { FileValidation } from './file-validation.js';
import { uploadFile } from '../../lib/minio.js';
import { sanitizeFilename } from '../../lib/tenant-schema.js';
import type {
  ObservationRecord,
  ObservationFileRecord,
  FileUploadData,
} from './observation.types.js';
import type { JWTPayload } from '../auth/auth.types.js';

export class ObservationService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create an observation with optional file attachments.
   */
  async create(
    reactivoId: string,
    content: string,
    files: FileUploadData[],
    actor: JWTPayload,
  ): Promise<ObservationRecord> {
    // Validate content is non-empty
    if (!content || content.trim().length === 0) {
      throw new ObservationError(
        400,
        ObservationErrorCode.EMPTY_CONTENT,
        'El contenido de la observación es obligatorio',
      );
    }

    // Validate reactivo exists
    const reactivoResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    if (reactivoResult.length === 0) {
      throw new ObservationError(
        404,
        ObservationErrorCode.REACTIVO_NOT_FOUND,
        'Reactivo no encontrado',
      );
    }

    // Validate and scan files
    for (const file of files) {
      // Validate size
      if (!FileValidation.validateSize(file.sizeBytes)) {
        throw new ObservationError(
          400,
          ObservationErrorCode.FILE_TOO_LARGE,
          `El archivo "${file.originalName}" excede el tamaño máximo permitido`,
        );
      }

      // Validate format
      const formatResult = FileValidation.validateFormat(file.mimeType, file.originalName);
      if (!formatResult.valid) {
        throw new ObservationError(
          400,
          ObservationErrorCode.INVALID_FORMAT,
          formatResult.error!,
        );
      }

      // Validate magic bytes (prevent MIME spoofing)
      const magicResult = FileValidation.validateMagicBytes(file.buffer, file.mimeType);
      if (!magicResult.valid) {
        throw new ObservationError(
          400,
          ObservationErrorCode.INVALID_FORMAT,
          magicResult.error!,
        );
      }

      // Scan for malware
      const scanResult = await FileValidation.scanForMalware(file.buffer);
      if (!scanResult.clean) {
        throw new ObservationError(
          400,
          ObservationErrorCode.MALWARE_DETECTED,
          `Archivo "${file.originalName}" rechazado: ${scanResult.threat}`,
        );
      }
    }

    // Create observation record
    const observationResult = await this.db
      .insert(observations)
      .values({
        reactivoId,
        authorId: actor.sub,
        content: content.trim(),
      })
      .returning();

    const observation = observationResult[0]!;

    // Upload files and create file records
    const fileRecords: ObservationFileRecord[] = [];

    for (const file of files) {
      const storageKey = `observations/${observation.id}/${randomUUID()}-${sanitizeFilename(file.originalName)}`;

      // Upload to MinIO
      await uploadFile(storageKey, file.buffer, file.mimeType);

      // Create file record
      const fileResult = await this.db
        .insert(observationFiles)
        .values({
          observationId: observation.id,
          originalName: file.originalName,
          storageKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          scanStatus: 'clean',
        })
        .returning();

      const fileRecord = fileResult[0]!;
      fileRecords.push({
        id: fileRecord.id,
        observationId: fileRecord.observationId,
        originalName: fileRecord.originalName,
        storageKey: fileRecord.storageKey,
        mimeType: fileRecord.mimeType,
        sizeBytes: fileRecord.sizeBytes,
        scanStatus: fileRecord.scanStatus,
        createdAt: fileRecord.createdAt.toISOString(),
      });
    }

    // Emit notification event (log for now)
    console.log(
      `[Notification] Nueva observación creada para reactivo ${reactivoId} por usuario ${actor.sub}`,
    );

    return {
      id: observation.id,
      reactivoId: observation.reactivoId,
      authorId: observation.authorId,
      content: observation.content,
      isRead: observation.isRead,
      readAt: observation.readAt?.toISOString() ?? null,
      createdAt: observation.createdAt.toISOString(),
      files: fileRecords,
    };
  }

  /**
   * Mark an observation as read by the technician who owns the reactivo.
   */
  async markAsRead(observationId: string, actor: JWTPayload): Promise<void> {
    // Fetch observation
    const observationResult = await this.db
      .select()
      .from(observations)
      .where(eq(observations.id, observationId))
      .limit(1);

    const observation = observationResult[0];
    if (!observation) {
      throw new ObservationError(
        404,
        ObservationErrorCode.NOT_FOUND,
        'Observación no encontrada',
      );
    }

    // Validate actor is the technician who owns the reactivo
    const reactivoResult = await this.db
      .select()
      .from(reactivos)
      .where(eq(reactivos.id, observation.reactivoId))
      .limit(1);

    const reactivo = reactivoResult[0];
    if (!reactivo || reactivo.tecnicoId !== actor.sub) {
      throw new ObservationError(
        403,
        ObservationErrorCode.UNAUTHORIZED,
        'Solo el técnico asignado puede marcar la observación como leída',
      );
    }

    // Update observation
    await this.db
      .update(observations)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(observations.id, observationId));
  }

  /**
   * Get all observations for a reactivo with their files.
   */
  async getByReactivo(reactivoId: string): Promise<ObservationRecord[]> {
    const observationResults = await this.db
      .select()
      .from(observations)
      .where(eq(observations.reactivoId, reactivoId))
      .orderBy(desc(observations.createdAt));

    const result: ObservationRecord[] = [];

    for (const obs of observationResults) {
      const files = await this.db
        .select()
        .from(observationFiles)
        .where(eq(observationFiles.observationId, obs.id));

      result.push({
        id: obs.id,
        reactivoId: obs.reactivoId,
        authorId: obs.authorId,
        content: obs.content,
        isRead: obs.isRead,
        readAt: obs.readAt?.toISOString() ?? null,
        createdAt: obs.createdAt.toISOString(),
        files: files.map((f) => ({
          id: f.id,
          observationId: f.observationId,
          originalName: f.originalName,
          storageKey: f.storageKey,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          scanStatus: f.scanStatus,
          createdAt: f.createdAt.toISOString(),
        })),
      });
    }

    return result;
  }

  /**
   * Get unread observations for reactivos owned by a technician.
   */
  async getUnreadByTecnico(tecnicoId: string): Promise<ObservationRecord[]> {
    // Get all reactivos owned by this technician
    const tecnicoReactivos = await this.db
      .select({ id: reactivos.id })
      .from(reactivos)
      .where(eq(reactivos.tecnicoId, tecnicoId));

    if (tecnicoReactivos.length === 0) {
      return [];
    }

    const reactivoIds = tecnicoReactivos.map((r) => r.id);

    // Get unread observations for those reactivos
    const allUnread: ObservationRecord[] = [];

    for (const rId of reactivoIds) {
      const unreadObs = await this.db
        .select()
        .from(observations)
        .where(
          and(
            eq(observations.reactivoId, rId),
            eq(observations.isRead, false),
          ),
        )
        .orderBy(desc(observations.createdAt));

      for (const obs of unreadObs) {
        const files = await this.db
          .select()
          .from(observationFiles)
          .where(eq(observationFiles.observationId, obs.id));

        allUnread.push({
          id: obs.id,
          reactivoId: obs.reactivoId,
          authorId: obs.authorId,
          content: obs.content,
          isRead: obs.isRead,
          readAt: obs.readAt?.toISOString() ?? null,
          createdAt: obs.createdAt.toISOString(),
          files: files.map((f) => ({
            id: f.id,
            observationId: f.observationId,
            originalName: f.originalName,
            storageKey: f.storageKey,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            scanStatus: f.scanStatus,
            createdAt: f.createdAt.toISOString(),
          })),
        });
      }
    }

    return allUnread;
  }
}
