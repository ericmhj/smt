import { createConnection, type Socket } from 'node:net';
import { extname } from 'node:path';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
]);

export interface FormatValidationResult {
  valid: boolean;
  error?: string;
}

export interface MalwareScanResult {
  clean: boolean;
  threat?: string;
}

export class FileValidation {
  /**
   * Validate file size against a configurable maximum.
   * Default max: 10 MB (configurable via env MAX_FILE_SIZE_MB).
   */
  static validateSize(sizeBytes: number, maxSizeMB?: number): boolean {
    const envLimit = Number(process.env.MAX_FILE_SIZE_MB);
    const limit = maxSizeMB ?? (isNaN(envLimit) ? 10 : envLimit);
    const maxBytes = limit * 1024 * 1024;
    return sizeBytes <= maxBytes;
  }

  /**
   * Validate file format by checking both MIME type and file extension.
   */
  static validateFormat(mimeType: string, originalName: string): FormatValidationResult {
    const ext = extname(originalName).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Extensión de archivo no permitida: ${ext}. Formatos permitidos: jpg, png, pdf, doc, docx, xls, xlsx`,
      };
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        valid: false,
        error: `Tipo MIME no permitido: ${mimeType}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate file magic bytes to prevent MIME type spoofing.
   * Checks the first few bytes of the file against known signatures.
   */
  static validateMagicBytes(buffer: Buffer, claimedMimeType: string): FormatValidationResult {
    if (buffer.length < 4) {
      return { valid: false, error: 'Archivo demasiado pequeño para ser válido' };
    }

    const magicChecks: Record<string, (buf: Buffer) => boolean> = {
      'image/jpeg': (buf) => buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,
      'image/png': (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47,
      'application/pdf': (buf) => buf.subarray(0, 5).toString() === '%PDF-',
      'application/msword': (buf) => buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (buf) => buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04,
      'application/vnd.ms-excel': (buf) => buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (buf) => buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04,
    };

    const checker = magicChecks[claimedMimeType];
    if (checker && !checker(buffer)) {
      return {
        valid: false,
        error: `El contenido del archivo no corresponde al tipo declarado (${claimedMimeType})`,
      };
    }

    return { valid: true };
  }

  /**
   * Scan file for malware using ClamAV via TCP.
   * Fail-closed: if ClamAV is unavailable or times out, the file is rejected.
   */
  static async scanForMalware(fileBuffer: Buffer): Promise<MalwareScanResult> {
    const host = process.env.CLAMAV_HOST || 'localhost';
    const port = Number(process.env.CLAMAV_PORT) || 3310;
    const timeout = 30_000; // 30 seconds

    return new Promise<MalwareScanResult>((resolve) => {
      let socket: Socket | null = null;
      let responseData = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        if (socket) {
          socket.destroy();
        }
        // Fail-closed: reject on timeout
        resolve({ clean: false, threat: 'Timeout al escanear archivo con ClamAV' });
      }, timeout);

      try {
        socket = createConnection({ host, port }, () => {
          // Send INSTREAM command
          socket!.write('zINSTREAM\0');

          // Send file data in chunks (ClamAV protocol: 4-byte length prefix per chunk)
          const chunkSize = 2048;
          for (let i = 0; i < fileBuffer.length; i += chunkSize) {
            const chunk = fileBuffer.subarray(i, i + chunkSize);
            const lengthBuf = Buffer.alloc(4);
            lengthBuf.writeUInt32BE(chunk.length, 0);
            socket!.write(lengthBuf);
            socket!.write(chunk);
          }

          // Send zero-length chunk to signal end of stream
          const endBuf = Buffer.alloc(4);
          endBuf.writeUInt32BE(0, 0);
          socket!.write(endBuf);
        });

        socket.on('data', (data) => {
          responseData += data.toString();
        });

        socket.on('end', () => {
          clearTimeout(timer);
          if (timedOut) return;

          const response = responseData.trim();
          // ClamAV response format: "stream: OK" or "stream: <virus_name> FOUND"
          if (response.includes('OK')) {
            resolve({ clean: true });
          } else {
            const match = response.match(/stream:\s*(.+)\s*FOUND/);
            const threat = match && match[1] ? match[1].trim() : 'Amenaza detectada';
            resolve({ clean: false, threat });
          }
        });

        socket.on('error', () => {
          clearTimeout(timer);
          if (timedOut) return;
          // Fail-closed: reject if ClamAV is unavailable
          resolve({ clean: false, threat: 'ClamAV no disponible' });
        });
      } catch {
        clearTimeout(timer);
        // Fail-closed: reject on any connection error
        resolve({ clean: false, threat: 'Error al conectar con ClamAV' });
      }
    });
  }
}
