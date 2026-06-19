-- Migration: Move existing tenant-scoped tables to sgr_default schema
-- This migration:
-- 1. Creates the sgr_default schema
-- 2. Moves all 17 tenant-scoped tables from public to sgr_default
-- 3. Keeps catalogo_estados, tenants, plans, schema_migrations in public
-- 4. Preserves all data, constraints, indexes, triggers, and sequences

-- Create the default tenant schema
CREATE SCHEMA IF NOT EXISTS sgr_default;

-- Move tenant-scoped tables from public to sgr_default
-- The ALTER TABLE SET SCHEMA preserves all data, constraints, indexes, triggers, and sequences

-- Note: Order matters due to foreign key dependencies.
-- Tables with no FK dependencies first, then dependents.

-- Move tables that have no dependencies on other tenant tables
ALTER TABLE IF EXISTS public.users SET SCHEMA sgr_default;

-- Move forms (depends on users)
ALTER TABLE IF EXISTS public.forms SET SCHEMA sgr_default;

-- Move form_versions (depends on forms, users)
ALTER TABLE IF EXISTS public.form_versions SET SCHEMA sgr_default;

-- Move form_assignments (depends on forms, users)
ALTER TABLE IF EXISTS public.form_assignments SET SCHEMA sgr_default;

-- Move reactivos (depends on forms, form_versions, users)
ALTER TABLE IF EXISTS public.reactivos SET SCHEMA sgr_default;

-- Move signatures (depends on users)
ALTER TABLE IF EXISTS public.signatures SET SCHEMA sgr_default;

-- Move state_transitions (depends on reactivos, users, signatures)
ALTER TABLE IF EXISTS public.state_transitions SET SCHEMA sgr_default;

-- Move observations (depends on reactivos, users)
ALTER TABLE IF EXISTS public.observations SET SCHEMA sgr_default;

-- Move observation_files (depends on observations)
ALTER TABLE IF EXISTS public.observation_files SET SCHEMA sgr_default;

-- Move notifications (depends on users)
ALTER TABLE IF EXISTS public.notifications SET SCHEMA sgr_default;

-- Move audit_logs (depends on users)
ALTER TABLE IF EXISTS public.audit_logs SET SCHEMA sgr_default;

-- Move clientes (depends on users)
ALTER TABLE IF EXISTS public.clientes SET SCHEMA sgr_default;

-- Move cliente_contactos (depends on clientes)
ALTER TABLE IF EXISTS public.cliente_contactos SET SCHEMA sgr_default;

-- Move cliente_documentos (depends on clientes, users)
ALTER TABLE IF EXISTS public.cliente_documentos SET SCHEMA sgr_default;

-- Move tickets (depends on clientes, forms, users, reactivos)
ALTER TABLE IF EXISTS public.tickets SET SCHEMA sgr_default;

-- Move sla_config (no FK dependencies)
ALTER TABLE IF EXISTS public.sla_config SET SCHEMA sgr_default;

-- Move reglas_asignacion (depends on users)
ALTER TABLE IF EXISTS public.reglas_asignacion SET SCHEMA sgr_default;

-- Verify: catalogo_estados stays in public (no ALTER needed)
-- Verify: tenants stays in public (no ALTER needed)
-- Verify: plans stays in public (no ALTER needed)
-- Verify: schema_migrations stays in public (no ALTER needed)
