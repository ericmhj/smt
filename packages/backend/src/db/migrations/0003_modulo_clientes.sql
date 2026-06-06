-- Migration: Módulo de Clientes
-- Adds 6 new tables for the customer management module

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  empresa VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(30) UNIQUE,
  direccion VARCHAR(500),
  industria VARCHAR(100),
  etiquetas JSONB NOT NULL DEFAULT '[]',
  asignado_a UUID REFERENCES users(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(nombre, '') || ' ' ||
      coalesce(empresa, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(telefono, '') || ' ' ||
      coalesce(direccion, '') || ' ' ||
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
CREATE INDEX IF NOT EXISTS idx_clientes_etiquetas_gin ON clientes USING GIN (etiquetas);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_industria ON clientes (industria);
CREATE INDEX IF NOT EXISTS idx_clientes_asignado ON clientes (asignado_a);
CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets (cliente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets (tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets (estado);
CREATE INDEX IF NOT EXISTS idx_tickets_prioridad ON tickets (prioridad);
CREATE INDEX IF NOT EXISTS idx_tickets_fecha_limite ON tickets (fecha_limite);

-- SLA default data
INSERT INTO sla_config (prioridad, horas_limite) VALUES
  ('alta', 24),
  ('media', 48),
  ('baja', 72)
ON CONFLICT (prioridad) DO NOTHING;
