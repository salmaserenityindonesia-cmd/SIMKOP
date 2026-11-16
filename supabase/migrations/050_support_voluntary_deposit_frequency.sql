-- Migration: 050_support_voluntary_deposit_frequency.sql
-- Description: Menambahkan dukungan tipe frekuensi 'voluntary' (Ditambah Mandiri / Tanpa Ditagih)
--              pada tabel public.deposit_types dan memperbarui produk SUKARELA.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'deposit_types'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%frequency_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.deposit_types DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.deposit_types
ADD CONSTRAINT deposit_types_frequency_type_check
CHECK (LOWER(frequency_type::text) = ANY (ARRAY[
  'monthly',
  'yearly',
  'one_time',
  'once',
  'voluntary'
]::text[]));

UPDATE public.deposit_types
SET frequency_type = 'voluntary',
    can_be_withdrawn = true
WHERE UPPER(code) = 'SUKARELA';

NOTIFY pgrst, 'reload schema';
