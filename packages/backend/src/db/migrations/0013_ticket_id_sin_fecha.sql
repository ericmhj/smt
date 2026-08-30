-- 0013: Reescribe los identificadores de ticket al nuevo formato SIN fecha.
--
-- Formato anterior: {prefix}-{YYYYMMDD}-{seq}  (ej. A1B2-20260830-A001)
-- Formato nuevo:    {prefix}-{seq}             (ej. A1B2-A001)
--
-- Cada tenant tiene su propia secuencia CONTINUA (no se reinicia). Para evitar
-- colisiones (los seq viejos podían repetirse entre trimestres), se RENUMERA
-- por tenant en orden de creación: A001, A002, ... A999, B001, ...
--
-- El MigrationRunner ejecuta este archivo con search_path apuntando a cada
-- schema sgr_<tenant>. La tabla public.tenants provee el hash_id (prefijo).

-- Ampliar current_letter para soportar letras múltiples (AA, AB, ...) en el rollover.
ALTER TABLE ticket_id_config ALTER COLUMN current_letter TYPE VARCHAR(6);

DO $$
DECLARE
  v_schema      TEXT := current_schema();
  v_prefix      TEXT;
  v_seq_format  TEXT := 'A001';
  rec           RECORD;
  v_index       INT := 0;          -- consecutivo absoluto (1..N)
  v_letter      TEXT;
  v_number      INT;
  v_seqstr      TEXT;
  v_new_id      TEXT;
  v_max_num     INT := 999;        -- para formato A001
BEGIN
  -- Prefijo: prefix custom de la config, o el hash_id del tenant.
  SELECT COALESCE(
           (SELECT prefix FROM ticket_id_config LIMIT 1),
           (SELECT hash_id FROM public.tenants
             WHERE 'sgr_' || replace(slug, '-', '_') = v_schema LIMIT 1),
           '0000'
         )
    INTO v_prefix;

  SELECT COALESCE((SELECT seq_format FROM ticket_id_config LIMIT 1), 'A001')
    INTO v_seq_format;

  IF v_seq_format = '0001' THEN v_max_num := 9999; ELSE v_max_num := 999; END IF;

  -- Recorrer tickets en orden de creación y renumerar
  FOR rec IN
    SELECT id, reactivo_id FROM tickets ORDER BY created_at, id
  LOOP
    v_index := v_index + 1;

    -- Calcular letra(s) y número a partir del índice absoluto (1-based)
    v_letter := chr(65 + (( (v_index - 1) / v_max_num ) % 26));  -- A..Z (rollover simple)
    v_number := ((v_index - 1) % v_max_num) + 1;

    IF v_seq_format = '001' THEN
      v_seqstr := lpad(v_number::text, 3, '0');
    ELSIF v_seq_format = '0001' THEN
      v_seqstr := lpad(v_number::text, 4, '0');
    ELSE
      v_seqstr := v_letter || lpad(v_number::text, 3, '0');
    END IF;

    v_new_id := v_prefix || '-' || v_seqstr;

    -- 1. tickets.identificador
    UPDATE tickets SET identificador = v_new_id WHERE id = rec.id;

    -- 2. ticket_id_registry
    UPDATE ticket_id_registry
       SET id_visible  = v_new_id,
           id_interno  = v_prefix || '-' || v_seqstr,
           periodo     = 'ALL',
           consecutivo = v_index
     WHERE ticket_id = rec.id;

    -- 3. reactivos.responses.informe_numero (para el PDF/formulario)
    IF rec.reactivo_id IS NOT NULL THEN
      UPDATE reactivos
         SET responses = jsonb_set(
               COALESCE(responses, '{}'::jsonb),
               '{informe_numero}',
               to_jsonb(v_new_id),
               true)
       WHERE id = rec.reactivo_id;
    END IF;
  END LOOP;

  -- 4. Dejar el contador de la config en el máximo alcanzado, sin reinicio.
  IF v_index > 0 THEN
    v_letter := chr(65 + (( (v_index - 1) / v_max_num ) % 26));
    v_number := ((v_index - 1) % v_max_num) + 1;

    UPDATE ticket_id_config
       SET current_letter = v_letter,
           current_number = v_number,
           current_period = 'ALL',
           seq_reset      = 'nunca',
           updated_at     = NOW();
  ELSE
    -- Sin tickets: solo asegurar el modo continuo
    UPDATE ticket_id_config
       SET current_period = 'ALL', seq_reset = 'nunca', updated_at = NOW();
  END IF;

  RAISE NOTICE 'Schema %: % tickets renumerados (prefix=%)', v_schema, v_index, v_prefix;
END $$;
