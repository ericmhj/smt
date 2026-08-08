-- Migration: Add theme_config to report_template_activations in all tenant schemas

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
        WHERE table_schema = schema_name AND table_name = 'report_template_activations'
      )
  LOOP
    RAISE NOTICE 'Adding theme_config to: %', tenant_schema;

    EXECUTE format('
      ALTER TABLE %I.report_template_activations
      ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT ''{}''
    ', tenant_schema);

    RAISE NOTICE 'Schema % updated.', tenant_schema;
  END LOOP;
END $$;
