-- Migration: Validation Rules Engine
-- Creates platform-level tables for form templates, validation rule templates,
-- tenant-level overrides, and form type columns.

-- Form Templates (Formularios Padre) - platform-level master form definitions
CREATE TABLE IF NOT EXISTS public.form_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_type VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  html_content TEXT NOT NULL,
  fields_metadata JSONB NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add template_id and form_type to tenant forms table
-- This runs per-tenant schema during migration
ALTER TABLE forms ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS form_type VARCHAR(50) DEFAULT 'legacy';

-- Validation Rule Templates - platform-level global validation rules per form type
CREATE TABLE IF NOT EXISTS public.validation_rule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sections JSONB NOT NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(form_type, name)
);

-- Indexes for validation_rule_templates
CREATE INDEX IF NOT EXISTS idx_validation_rules_form_type ON public.validation_rule_templates(form_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_active ON public.validation_rule_templates(form_type, is_active);
