-- Platform Tables Migration
-- Creates platform-level tables in the public schema for multi-tenant management

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'starter',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  config JSONB DEFAULT '{}',
  scheduled_deletion_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'pending_deletion'))
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  max_users INTEGER NOT NULL,
  max_forms INTEGER NOT NULL,
  max_storage_mb INTEGER NOT NULL,
  features JSONB DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schema_name VARCHAR(100) NOT NULL,
  migration_name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schema_name, migration_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_schema ON schema_migrations (schema_name);

-- Seed default plans
INSERT INTO plans (nombre, max_users, max_forms, max_storage_mb, features) VALUES
  ('starter', 10, 20, 1024, '{"reports": true, "api_access": false}'),
  ('professional', 50, 100, 5120, '{"reports": true, "api_access": true, "custom_branding": true}'),
  ('enterprise', 500, 1000, 51200, '{"reports": true, "api_access": true, "custom_branding": true, "sso": true, "audit_export": true}')
ON CONFLICT (nombre) DO NOTHING;

-- Insert default tenant (for existing deployment migration)
INSERT INTO tenants (id, slug, nombre, plan, status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'default', 'SGR Principal', 'starter', 'active')
ON CONFLICT (slug) DO NOTHING;
