import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { reactivos } from '../../db/schema/reactivos.js';
import { uploadFile, getFileUrl } from '../../lib/minio.js';
import { PDFService } from './pdf.service.js';

// Plan-based download limits (hardcoded for now — Task 13.6)
const PLAN_DOWNLOAD_LIMITS: Record<string, number> = {
  PLAN_BASICO: 3,
  PLAN_PRO: 10,
  PLAN_ENTERPRISE: -1, // unlimited
};

export class PdfStorageService {
  private db: Database;
  private pdfService: PDFService;

  constructor(db: Database) {
    this.db = db;
    this.pdfService = new PDFService(db);
  }

  /**
   * Generate PDF and store in S3. Called during submit.
   * Returns the storage key.
   */
  async generateAndStore(reactivoId: string, tenantSlug: string): Promise<string> {
    const pdfBuffer = await this.pdfService.generate(reactivoId);
    const storageKey = `pdfs/${reactivoId}.pdf`;

    await uploadFile(storageKey, pdfBuffer, 'application/pdf', tenantSlug);

    // Save the storage key in the reactivo record
    await this.db
      .update(reactivos)
      .set({ pdfStorageKey: `${tenantSlug}/${storageKey}` })
      .where(eq(reactivos.id, reactivoId));

    return `${tenantSlug}/${storageKey}`;
  }

  /**
   * Get PDF buffer for download. Serves from S3 if stored, or generates on-demand (legacy).
   * Increments download_count.
   * Returns { buffer, downloadCount, pdfStorageKey }.
   */
  async getPdfForDownload(reactivoId: string): Promise<{
    buffer: Buffer;
    downloadCount: number;
    pdfStorageKey: string | null;
  }> {
    // Get current reactivo state
    const result = await this.db
      .select({
        pdfStorageKey: reactivos.pdfStorageKey,
        downloadCount: reactivos.downloadCount,
      })
      .from(reactivos)
      .where(eq(reactivos.id, reactivoId))
      .limit(1);

    const reactivo = result[0];
    if (!reactivo) {
      throw new Error('Reactivo not found');
    }

    let buffer: Buffer;

    if (reactivo.pdfStorageKey) {
      // Serve from S3 (new flow)
      const url = await getFileUrl(reactivo.pdfStorageKey);
      const response = await fetch(url);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Legacy: generate on-demand
      buffer = await this.pdfService.generate(reactivoId);
    }

    // Increment download count
    const updated = await this.db
      .update(reactivos)
      .set({ downloadCount: sql`${reactivos.downloadCount} + 1` })
      .where(eq(reactivos.id, reactivoId))
      .returning({ downloadCount: reactivos.downloadCount });

    return {
      buffer,
      downloadCount: updated[0]?.downloadCount ?? reactivo.downloadCount + 1,
      pdfStorageKey: reactivo.pdfStorageKey,
    };
  }

  /**
   * Check if download requires credit payment based on plan limits.
   * Returns true if credit should be consumed.
   */
  shouldChargeForDownload(downloadCount: number, planType: string): boolean {
    const limit = PLAN_DOWNLOAD_LIMITS[planType] ?? 3; // default to BASICO
    if (limit === -1) return false; // unlimited
    return downloadCount >= limit;
  }

  /**
   * Reset download counter after credit charge.
   */
  async resetDownloadCount(reactivoId: string): Promise<void> {
    await this.db
      .update(reactivos)
      .set({ downloadCount: 0 })
      .where(eq(reactivos.id, reactivoId));
  }

  /**
   * Get max free downloads for a plan type.
   */
  getMaxFreeDownloads(planType: string): number {
    const limit = PLAN_DOWNLOAD_LIMITS[planType] ?? 3;
    return limit === -1 ? Infinity : limit;
  }
}
