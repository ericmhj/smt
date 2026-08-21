-- Migration: Add hash_id column to tenants and populate for existing records
-- Also add identificador column to tickets (per-tenant schema)

-- Step 1: Add hash_id column as nullable first
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS hash_id VARCHAR(4);

-- Step 2: Populate hash_id for existing tenants using MD5 of slug
-- Formula: last 4 hex of MD5 → convert to integer → last 4 digits → zero-padded
UPDATE public.tenants
SET hash_id = LPAD(
  (substring(md5(slug) from 29 for 4)::bit(16)::int % 10000)::text,
  4, '0'
)
WHERE hash_id IS NULL;

-- Step 3: Make hash_id NOT NULL and UNIQUE
ALTER TABLE public.tenants ALTER COLUMN hash_id SET NOT NULL;

-- Create unique index if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tenants_hash_id_unique') THEN
    CREATE UNIQUE INDEX tenants_hash_id_unique ON public.tenants (hash_id);
  END IF;
END
$$;

-- Step 4: Add identificador column to tickets table (in each tenant schema)
-- This needs to run per-schema. We'll do it dynamically.
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT 'sgr_' || replace(slug, '-', '_') FROM public.tenants
  LOOP
    -- Add column if not exists
    EXECUTE format(
      'ALTER TABLE %I.tickets ADD COLUMN IF NOT EXISTS identificador VARCHAR(20)',
      schema_name
    );
    
    -- Populate existing tickets with generated identifiers
    EXECUTE format($sql$
      WITH numbered AS (
        SELECT id, created_at,
          ROW_NUMBER() OVER (PARTITION BY DATE(created_at) ORDER BY created_at) as seq
        FROM %I.tickets
        WHERE identificador IS NULL
      )
      UPDATE %I.tickets t
      SET identificador = (
        SELECT LPAD(
          (substring(md5(ten.slug) from 29 for 4)::bit(16)::int %% 10000)::text,
          4, '0'
        ) || '-' || TO_CHAR(n.created_at, 'YYYYMMDD') || '-' || LPAD(n.seq::text, 3, '0')
        FROM numbered n, public.tenants ten
        WHERE n.id = t.id
          AND ten.slug = replace(substring(%L from 5), '_', '-')
      )
      WHERE t.identificador IS NULL
    $sql$, schema_name, schema_name, schema_name);

    -- Add NOT NULL constraint and unique index
    EXECUTE format(
      'ALTER TABLE %I.tickets ALTER COLUMN identificador SET NOT NULL',
      schema_name
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_%s_tickets_identificador ON %I.tickets (identificador)',
      replace(schema_name, '.', '_'), schema_name
    );
  END LOOP;
END
$$;

-- Verification query
SELECT slug, hash_id FROM public.tenants ORDER BY slug;
