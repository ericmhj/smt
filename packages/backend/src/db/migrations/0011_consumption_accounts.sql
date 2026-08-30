-- Migration: 0011_consumption_accounts
-- Adds tenant consumption accounts (credit balance mirror) and ledger (movement history)
-- These tables live in the public schema and are updated EXCLUSIVELY via Kafka events
-- from the license-service. No SMT endpoint modifies the balance directly.

-- Saldo espejo por tenant (1 registro por tenant)
CREATE TABLE IF NOT EXISTS public.tenant_consumption_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  saldo_creditos              DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (saldo_creditos >= 0),
  creditos_totales_adquiridos INTEGER NOT NULL DEFAULT 0,
  ultimo_evento_id            VARCHAR(100),
  ultimo_sync                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial de movimientos (append-only, nunca se modifica ni elimina)
CREATE TABLE IF NOT EXISTS public.consumption_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  evento_externo_id   VARCHAR(100) NOT NULL UNIQUE,
  tipo                VARCHAR(20) NOT NULL,
  cantidad            DECIMAL(10,2) NOT NULL,
  saldo_resultante    DECIMAL(10,2) NOT NULL,
  concepto            VARCHAR(255) NOT NULL,
  perfil_documento    VARCHAR(50),
  referencia          VARCHAR(255),
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON public.consumption_ledger(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_evento ON public.consumption_ledger(evento_externo_id);

-- Prevent any UPDATE or DELETE on the ledger (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consumption_ledger is append-only. UPDATE and DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_no_update ON public.consumption_ledger;
CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.consumption_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_modification();
