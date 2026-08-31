-- Correlación de tenants entre license-service (fuente de verdad) y SMT.
-- Cambios ADITIVOS y seguros sobre volúmenes existentes (no borran datos):
--   1. Permite el estado 'onboarding' en public.tenants.
--   2. Añade license_tenant_id: FK lógica al tenant.id (UUID) de license-service.
--
-- El espejo del tenant se crea en SMT desde el evento tenant.onboarded
-- (instante en que el tenant se crea en license-service), antes de su activación.
-- license_tenant_id es la clave de correlación cross-service; el id local se
-- conserva para no romper FKs existentes (consumption_accounts, ledger, etc.).

-- 1. Estado onboarding
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('onboarding', 'active', 'suspended', 'pending_deletion'));

-- 2. Columna puente hacia license-service (nullable para no romper filas existentes;
--    se rellena por provisioning en nuevos y por backfill en existentes).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS license_tenant_id UUID;

-- Unicidad de la correlación (permite múltiples NULL en Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_license_tenant_id
  ON public.tenants (license_tenant_id);
