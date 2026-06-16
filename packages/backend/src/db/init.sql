-- SGR Database Initialization Script
-- Valid roles: superusuario, admin, manager, tecnico
-- Valid states: pendiente, en_revision, validado, rechazado, finalizado

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (role as VARCHAR to avoid enum migration issues)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'tecnico',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forms
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  parent_form_id UUID,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Form Versions
CREATE TABLE IF NOT EXISTS form_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  html_content TEXT NOT NULL,
  sanitized_html TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  fields_metadata JSONB NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Form Assignments
CREATE TABLE IF NOT EXISTS form_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  tecnico_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Reactivos (state as VARCHAR)
CREATE TABLE IF NOT EXISTS reactivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id),
  form_version_id UUID NOT NULL REFERENCES form_versions(id),
  tecnico_id UUID NOT NULL REFERENCES users(id),
  parent_reactivo_id UUID REFERENCES reactivos(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  state VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  responses JSONB NOT NULL DEFAULT '{}',
  rejection_reason VARCHAR(1000),
  fecha_programada TIMESTAMPTZ,
  cliente_nombre VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signatures
CREATE TABLE IF NOT EXISTS signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  encrypted_image BYTEA NOT NULL,
  image_hash VARCHAR(255) NOT NULL,
  hmac VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- State Transitions
CREATE TABLE IF NOT EXISTS state_transitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reactivo_id UUID NOT NULL REFERENCES reactivos(id),
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  signature_id UUID NOT NULL REFERENCES signatures(id),
  reason VARCHAR(1000),
  ip_address VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Observations
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reactivo_id UUID NOT NULL REFERENCES reactivos(id),
  author_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Observation Files
CREATE TABLE IF NOT EXISTS observation_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  scan_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_role VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reactivos_responses ON reactivos USING GIN (responses);
CREATE INDEX IF NOT EXISTS idx_reactivos_state ON reactivos (state);
CREATE INDEX IF NOT EXISTS idx_reactivos_tecnico_id ON reactivos (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_reactivos_form_version ON reactivos (form_version_id);
CREATE INDEX IF NOT EXISTS idx_notifications_payload ON notifications USING GIN (payload);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details ON audit_logs USING GIN (details);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_active ON form_assignments (tecnico_id, is_active);

-- Trigger: prevent UPDATE/DELETE on audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();


-- ============================================================================
-- CATÁLOGOS DEL SISTEMA
-- ============================================================================

-- Catálogo de estados de reactivos
CREATE TABLE IF NOT EXISTS catalogo_estados (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  etiqueta VARCHAR(100) NOT NULL,
  color VARCHAR(50) NOT NULL,
  orden INTEGER NOT NULL,
  es_terminal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed de estados
INSERT INTO catalogo_estados (codigo, etiqueta, color, orden, es_terminal) VALUES
  ('pendiente', 'Programado', 'yellow', 1, false),
  ('en_revision', 'En Evaluación', 'blue', 2, false),
  ('validado', 'Validado', 'green', 3, false),
  ('rechazado', 'Rechazado', 'red', 4, true),
  ('finalizado', 'Finalizado', 'gray', 5, true)
ON CONFLICT (codigo) DO UPDATE SET
  etiqueta = EXCLUDED.etiqueta,
  color = EXCLUDED.color,
  orden = EXCLUDED.orden,
  es_terminal = EXCLUDED.es_terminal;


-- ============================================================================
-- MÓDULO DE CLIENTES
-- ============================================================================

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  empresa VARCHAR(255),
  rfc VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(30) NOT NULL,
  direccion_centro_trabajo VARCHAR(500) NOT NULL,
  actividad_principal VARCHAR(255) NOT NULL,
  contacto VARCHAR(255) NOT NULL,
  horarios VARCHAR(255) NOT NULL,
  industria VARCHAR(100),
  etiquetas JSONB NOT NULL DEFAULT '[]',
  asignado_a UUID REFERENCES users(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(nombre, '') || ' ' ||
      coalesce(empresa, '') || ' ' ||
      coalesce(rfc, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(telefono, '') || ' ' ||
      coalesce(direccion_centro_trabajo, '') || ' ' ||
      coalesce(actividad_principal, '') || ' ' ||
      coalesce(contacto, '') || ' ' ||
      coalesce(industria, '')
    )
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cliente Contactos
CREATE TABLE IF NOT EXISTS cliente_contactos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefono VARCHAR(30),
  cargo VARCHAR(100),
  es_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cliente Documentos
CREATE TABLE IF NOT EXISTS cliente_documentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tickets (Solicitudes de Ensayo)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  form_id UUID NOT NULL REFERENCES forms(id),
  tecnico_asignado_id UUID REFERENCES users(id),
  reactivo_id UUID REFERENCES reactivos(id),
  prioridad VARCHAR(10) NOT NULL DEFAULT 'media',
  sla_horas INTEGER NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  fecha_limite TIMESTAMPTZ NOT NULL,
  creado_por UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SLA Configuration
CREATE TABLE IF NOT EXISTS sla_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prioridad VARCHAR(10) NOT NULL UNIQUE,
  horas_limite INTEGER NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reglas de Asignación Automática
CREATE TABLE IF NOT EXISTS reglas_asignacion (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  condiciones JSONB NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Clientes module
CREATE INDEX IF NOT EXISTS idx_clientes_search ON clientes USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_clientes_etiquetas ON clientes USING GIN (etiquetas);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_industria ON clientes (industria);
CREATE INDEX IF NOT EXISTS idx_clientes_asignado ON clientes (asignado_a);
CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets (cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets (tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets (estado);
CREATE INDEX IF NOT EXISTS idx_tickets_prioridad ON tickets (prioridad);
CREATE INDEX IF NOT EXISTS idx_tickets_fecha_limite ON tickets (fecha_limite);

-- Seed SLA default values
INSERT INTO sla_config (prioridad, horas_limite) VALUES
  ('alta', 24),
  ('media', 48),
  ('baja', 72)
ON CONFLICT (prioridad) DO NOTHING;
