-- Populate hash_id for existing tenants
-- Uses last 4 hex chars of MD5, converts to int, mod 10000, zero-padded to 4 digits
UPDATE public.tenants
SET hash_id = LPAD(
  (('x' || substring(md5(slug) from 29 for 4))::bit(16)::int % 10000)::text,
  4, '0'
)
WHERE hash_id IS NULL;

-- Set NOT NULL
ALTER TABLE public.tenants ALTER COLUMN hash_id SET NOT NULL;

-- Add unique constraint
ALTER TABLE public.tenants ADD CONSTRAINT tenants_hash_id_unique UNIQUE (hash_id);

-- Verify
SELECT slug, hash_id, nombre FROM public.tenants ORDER BY slug;
