-- Add new technician role label to user_role enum
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE 'tecnico_de_campo';
EXCEPTION WHEN duplicate_object THEN null;
END$$;
