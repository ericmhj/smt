DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'sgr_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.forms ADD COLUMN IF NOT EXISTS template_id UUID', s);
    EXECUTE format('ALTER TABLE %I.forms ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) DEFAULT ''legacy''', s);
  END LOOP;
END $$;
