-- 0012: Crea las tablas de identificadores de ticket en schemas de tenant existentes.
--
-- Estas tablas ya existen en el schema-template.sql (para tenants nuevos), pero los
-- tenants creados ANTES de que se agregaran al template no las tienen, lo que provoca
-- el error: relation "ticket_id_config" does not exist al crear un ticket.
--
-- El MigrationRunner ejecuta este archivo con search_path apuntando a cada schema
-- sgr_<tenant>, por lo que las tablas se crean sin prefijo de schema.
-- Idempotente: CREATE TABLE IF NOT EXISTS.

-- Configuración: cómo genera el tenant sus IDs de ticket
CREATE TABLE IF NOT EXISTS ticket_id_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefix VARCHAR(20),
  seq_format VARCHAR(10) NOT NULL DEFAULT 'A001',
  seq_reset VARCHAR(20) NOT NULL DEFAULT 'trimestral',
  current_letter CHAR(1) NOT NULL DEFAULT 'A',
  current_number INTEGER NOT NULL DEFAULT 0,
  current_period VARCHAR(10) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro: mapea el ID interno con el ID visible por cada ticket
CREATE TABLE IF NOT EXISTS ticket_id_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  id_interno VARCHAR(50) NOT NULL,
  id_visible VARCHAR(50) NOT NULL,
  periodo VARCHAR(10) NOT NULL,
  consecutivo INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_interno),
  UNIQUE(id_visible)
);

CREATE INDEX IF NOT EXISTS idx_ticket_id_registry_ticket ON ticket_id_registry (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_id_registry_periodo ON ticket_id_registry (periodo);
