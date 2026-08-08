-- Migration: Report Templates Engine - Tenant Tables
-- Creates report_template_activations and report_template_overrides in all tenant schemas

DO $$
DECLARE
  tenant_schema TEXT;
BEGIN
  FOR tenant_schema IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')
      AND schema_name NOT LIKE 'pg_%'
      AND EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = schema_name AND table_name = 'users'
      )
  LOOP
    RAISE NOTICE 'Aplicando a schema: %', tenant_schema;

    -- report_template_activations
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.report_template_activations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        report_template_id UUID NOT NULL,
        activated_by UUID NOT NULL REFERENCES %I.users(id),
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', tenant_schema, tenant_schema);

    -- report_template_overrides
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.report_template_overrides (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        form_id UUID NOT NULL REFERENCES %I.forms(id) ON DELETE CASCADE,
        report_template_id UUID NOT NULL,
        override_type VARCHAR(20) NOT NULL CHECK (override_type IN (''deactivate'', ''custom'')),
        custom_sections JSONB,
        created_by UUID NOT NULL REFERENCES %I.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )', tenant_schema, tenant_schema, tenant_schema);

    -- Indexes
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_rta_template_id
        ON %I.report_template_activations (report_template_id)', tenant_schema);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_rto_form_id
        ON %I.report_template_overrides (form_id)', tenant_schema);
    EXECUTE format('
      CREATE INDEX IF NOT EXISTS idx_rto_template_id
        ON %I.report_template_overrides (report_template_id)', tenant_schema);

    RAISE NOTICE 'Schema % actualizado correctamente.', tenant_schema;
  END LOOP;
END $$;
