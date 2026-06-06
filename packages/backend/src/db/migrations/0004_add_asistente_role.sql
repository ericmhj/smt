-- Add 'asistente' role to the system
-- Note: The users table uses VARCHAR for the role column, so no ALTER TYPE is needed.

-- Valid roles after this migration:
-- superusuario, admin, manager, tecnico, asistente

-- No-op: role column is VARCHAR, new value is handled at application level.
SELECT 1;
