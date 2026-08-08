-- Migration: Add tenant_slug, tenant_form_id, parent_template_id to report_templates

ALTER TABLE public.report_templates
  ADD COLUMN IF NOT EXISTS tenant_slug VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tenant_form_id UUID,
  ADD COLUMN IF NOT EXISTS parent_template_id UUID;

-- Index for quick lookup by tenant + form
CREATE INDEX IF NOT EXISTS idx_rt_tenant_form
  ON public.report_templates (tenant_slug, tenant_form_id)
  WHERE tenant_form_id IS NOT NULL;

-- Index for parent template lookup
CREATE INDEX IF NOT EXISTS idx_rt_parent
  ON public.report_templates (parent_template_id)
  WHERE parent_template_id IS NOT NULL;
