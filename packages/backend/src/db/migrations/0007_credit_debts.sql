-- Migration: Create platform.credit_debts table for deferred credit consumption
CREATE TABLE IF NOT EXISTS platform.credit_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  operation_type VARCHAR(50) NOT NULL DEFAULT 'pdf_generation',
  metadata JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ
);

CREATE INDEX idx_credit_debts_tenant ON platform.credit_debts(tenant_id);
CREATE INDEX idx_credit_debts_status ON platform.credit_debts(status);
