-- Migration: Calculation Rules Engine
-- Creates platform-level calculation rule templates and tenant-level overrides.

-- Calculation Rule Templates - platform-level global calculation rules per form type
CREATE TABLE IF NOT EXISTS public.calculation_rule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  calculations JSONB NOT NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(form_type, name)
);

CREATE INDEX IF NOT EXISTS idx_calculation_rules_form_type ON public.calculation_rule_templates(form_type);
CREATE INDEX IF NOT EXISTS idx_calculation_rules_active ON public.calculation_rule_templates(form_type, is_active);

-- Add calculation_rule_overrides to tenant schemas (run per tenant)
ALTER TABLE forms ADD COLUMN IF NOT EXISTS has_calculations BOOLEAN DEFAULT false;
