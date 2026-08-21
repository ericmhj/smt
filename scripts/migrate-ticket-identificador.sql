-- Migration: Add identificador column to tickets in all tenant schemas
-- and populate existing tickets

DO $$
DECLARE
  schema_rec RECORD;
  ticket_rec RECORD;
  tenant_hash TEXT;
  date_str TEXT;
  seq_num INT;
  new_id TEXT;
BEGIN
  FOR schema_rec IN
    SELECT schemaname FROM pg_tables WHERE tablename = 'tickets' AND schemaname LIKE 'sgr_%'
  LOOP
    -- Add column if not exists
    EXECUTE format(
      'ALTER TABLE %I.tickets ADD COLUMN IF NOT EXISTS identificador VARCHAR(20)',
      schema_rec.schemaname
    );

    -- Get tenant hash_id for this schema
    -- Schema name is sgr_<slug_with_underscores>, tenant slug uses hyphens
    SELECT hash_id INTO tenant_hash
    FROM public.tenants
    WHERE 'sgr_' || replace(slug, '-', '_') = schema_rec.schemaname;

    IF tenant_hash IS NULL THEN
      RAISE NOTICE 'No tenant found for schema %', schema_rec.schemaname;
      CONTINUE;
    END IF;

    -- Populate existing tickets grouped by date
    FOR ticket_rec IN
      EXECUTE format(
        'SELECT id, created_at FROM %I.tickets WHERE identificador IS NULL ORDER BY created_at',
        schema_rec.schemaname
      )
    LOOP
      date_str := TO_CHAR(ticket_rec.created_at, 'YYYYMMDD');

      -- Count existing tickets for this date
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.tickets WHERE identificador LIKE $1',
        schema_rec.schemaname
      ) INTO seq_num USING tenant_hash || '-' || date_str || '-%';

      seq_num := seq_num + 1;
      new_id := tenant_hash || '-' || date_str || '-' || LPAD(seq_num::text, 3, '0');

      EXECUTE format(
        'UPDATE %I.tickets SET identificador = $1 WHERE id = $2',
        schema_rec.schemaname
      ) USING new_id, ticket_rec.id;
    END LOOP;

    -- Make NOT NULL
    EXECUTE format(
      'ALTER TABLE %I.tickets ALTER COLUMN identificador SET NOT NULL',
      schema_rec.schemaname
    );

    -- Add unique index
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_%s_tickets_ident ON %I.tickets (identificador)',
      replace(schema_rec.schemaname, '.', '_'), schema_rec.schemaname
    );

    RAISE NOTICE 'Migrated schema: %', schema_rec.schemaname;
  END LOOP;
END
$$;

-- Verify: show a sample from el-reloj
SELECT identificador, estado, created_at FROM sgr_el_reloj.tickets ORDER BY created_at LIMIT 10;
