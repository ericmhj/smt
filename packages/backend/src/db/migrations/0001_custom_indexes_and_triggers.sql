-- Custom migration: Indexes and triggers for SGR
-- This migration adds performance indexes and the append-only trigger for audit_logs

-- =============================================================================
-- GIN Indexes for JSONB columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_reactivos_responses_gin
  ON reactivos USING GIN (responses);

CREATE INDEX IF NOT EXISTS idx_notifications_payload_gin
  ON notifications USING GIN (payload);

CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin
  ON audit_logs USING GIN (details);

-- =============================================================================
-- B-tree Indexes for frequently queried columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_reactivos_state
  ON reactivos (state);

CREATE INDEX IF NOT EXISTS idx_reactivos_tecnico_id
  ON reactivos (tecnico_id);

CREATE INDEX IF NOT EXISTS idx_reactivos_form_version_id
  ON reactivos (form_version_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

-- =============================================================================
-- Append-only trigger for audit_logs (prevents UPDATE and DELETE)
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only. UPDATE and DELETE operations are not allowed.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();
