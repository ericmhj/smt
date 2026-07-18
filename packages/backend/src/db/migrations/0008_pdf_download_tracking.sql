-- Migration: Add PDF storage and download tracking to reactivos
ALTER TABLE reactivos ADD COLUMN IF NOT EXISTS pdf_storage_key VARCHAR(255);
ALTER TABLE reactivos ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN reactivos.pdf_storage_key IS 'S3/Garage storage key for the generated PDF (e.g., {tenantSlug}/pdfs/{reactivoId}.pdf)';
COMMENT ON COLUMN reactivos.download_count IS 'Number of times this PDF has been downloaded since last credit charge';
