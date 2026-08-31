-- Añade el estado terminal 'cancelled' a public.tenants para reflejar
-- fielmente el estado CANCELLED del tenant en license-service (fuente de verdad).
-- Cambio ADITIVO sobre volúmenes existentes (no borra datos).

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('onboarding', 'active', 'suspended', 'cancelled', 'pending_deletion'));
