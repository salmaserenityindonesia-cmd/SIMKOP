-- Migration: 20261120_add_reset_transactional_data_rpc.sql
-- Description: Fungsi PostgreSQL RPC atomik (SECURITY DEFINER) untuk mengosongkan seluruh
--              tabel transaksional pada skema public sambil mempertahankan 9 tabel master inti
--              (anggota, deposit_types, koperasi_profile, loan_types, pengelola, pos_settings,
--              product_categories, products, savings_rate_tiers) serta memulihkan status
--              keanggotaan anggota menjadi ACTIVE.

CREATE OR REPLACE FUNCTION public.reset_transactional_data_keep_masters(
  p_confirmation_phrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_whitelist CONSTANT TEXT[] := ARRAY[
    'anggota',
    'deposit_types',
    'koperasi_profile',
    'loan_types',
    'pengelola',
    'pos_settings',
    'product_categories',
    'products',
    'savings_rate_tiers',
    'schema_migrations'
  ];
  v_tables_to_truncate TEXT[];
  v_truncate_sql TEXT;
  v_has_membership_status BOOLEAN := FALSE;
  v_has_status BOOLEAN := FALSE;
  v_has_suspended_at BOOLEAN := FALSE;
  v_has_suspension_reason BOOLEAN := FALSE;
  v_has_updated_at BOOLEAN := FALSE;
  v_set_clauses TEXT[] := ARRAY[]::TEXT[];
  v_where_clauses TEXT[] := ARRAY[]::TEXT[];
  v_restored_members_count INTEGER := 0;
BEGIN
  -- 1. Otorisasi role: wajib admin jika dipanggil melalui PostgREST JWT (bukan service_role / SQL Editor)
  IF NULLIF(current_setting('request.jwt.claim.role', true), '') IS NOT NULL
     AND current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan menjalankan reset data transaksional.';
  END IF;

  -- 2. Validasi frasa konfirmasi persis (case-sensitive)
  IF COALESCE(TRIM(p_confirmation_phrase), '') <> 'RESET DATA TRANSAKSI' THEN
    RAISE EXCEPTION 'Frasa konfirmasi tidak valid. Ketik tepat: RESET DATA TRANSAKSI';
  END IF;

  -- 3. Kumpulkan seluruh tabel skema public selain 9 tabel whitelist (+ schema_migrations)
  --    serta lindungi secara transitif tabel apa pun yang dirujuk FK oleh tabel whitelist
  --    agar TRUNCATE ... CASCADE tidak pernah menyentuh data master.
  WITH RECURSIVE protected_tables(relid) AS (
    SELECT c.oid AS relid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname = ANY(v_whitelist)
    UNION
    SELECT fk.confrelid AS relid
    FROM pg_constraint fk
    JOIN protected_tables pt ON fk.conrelid = pt.relid
    WHERE fk.contype = 'f'
      AND fk.confrelid <> 0
  )
  SELECT ARRAY_AGG(format('%I.%I', t.schemaname, t.tablename) ORDER BY t.tablename)
  INTO v_tables_to_truncate
  FROM pg_tables t
  JOIN pg_namespace n ON n.nspname = t.schemaname
  JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.tablename
  WHERE t.schemaname = 'public'
    AND c.relkind IN ('r', 'p')
    AND NOT (t.tablename = ANY(v_whitelist))
    AND c.oid NOT IN (SELECT relid FROM protected_tables);

  -- 4. Kosongkan seluruh tabel transaksional secara atomik
  IF v_tables_to_truncate IS NOT NULL AND ARRAY_LENGTH(v_tables_to_truncate, 1) > 0 THEN
    v_truncate_sql := 'TRUNCATE TABLE ' || ARRAY_TO_STRING(v_tables_to_truncate, ', ') || ' RESTART IDENTITY CASCADE;';
    EXECUTE v_truncate_sql;
  END IF;

  -- 5. Pulihkan status keanggotaan anggota (RESIGNED / SUSPENDED / nonaktif -> ACTIVE / aktif)
  --    tanpa mengubah NRP ataupun data gaji/rekening anggota.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anggota' AND column_name = 'membership_status'
  ) INTO v_has_membership_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anggota' AND column_name = 'status'
  ) INTO v_has_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anggota' AND column_name = 'suspended_at'
  ) INTO v_has_suspended_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anggota' AND column_name = 'suspension_reason'
  ) INTO v_has_suspension_reason;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'anggota' AND column_name = 'updated_at'
  ) INTO v_has_updated_at;

  IF v_has_membership_status THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'membership_status = ''ACTIVE''');
    v_where_clauses := ARRAY_APPEND(v_where_clauses, 'membership_status IS DISTINCT FROM ''ACTIVE''');
  END IF;

  IF v_has_status THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'status = ''aktif''');
    v_where_clauses := ARRAY_APPEND(v_where_clauses, 'status IS DISTINCT FROM ''aktif''');
  END IF;

  IF v_has_suspended_at THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'suspended_at = NULL');
    v_where_clauses := ARRAY_APPEND(v_where_clauses, 'suspended_at IS NOT NULL');
  END IF;

  IF v_has_suspension_reason THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'suspension_reason = NULL');
    v_where_clauses := ARRAY_APPEND(v_where_clauses, 'suspension_reason IS NOT NULL');
  END IF;

  IF v_has_updated_at AND ARRAY_LENGTH(v_where_clauses, 1) > 0 THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'updated_at = TIMEZONE(''utc''::text, NOW())');
  END IF;

  IF ARRAY_LENGTH(v_where_clauses, 1) > 0 THEN
    EXECUTE 'UPDATE public.anggota SET ' || ARRAY_TO_STRING(v_set_clauses, ', ')
         || ' WHERE ' || ARRAY_TO_STRING(v_where_clauses, ' OR ');
    GET DIAGNOSTICS v_restored_members_count = ROW_COUNT;
  END IF;

  -- 6. Kembalikan ringkasan eksekusi JSONB
  RETURN jsonb_build_object(
    'success', true,
    'truncated_count', COALESCE(ARRAY_LENGTH(v_tables_to_truncate, 1), 0),
    'truncated_tables', COALESCE(to_jsonb(v_tables_to_truncate), '[]'::jsonb),
    'preserved_tables', to_jsonb(v_whitelist),
    'restored_members_count', COALESCE(v_restored_members_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_transactional_data_keep_masters(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_transactional_data_keep_masters(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_transactional_data_keep_masters(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_transactional_data_keep_masters(TEXT)
IS 'Mengosongkan seluruh tabel transaksional pada skema public secara atomik sambil mempertahankan 9 tabel master inti (anggota, deposit_types, koperasi_profile, loan_types, pengelola, pos_settings, product_categories, products, savings_rate_tiers) dan memulihkan status anggota ke ACTIVE.';

NOTIFY pgrst, 'reload schema';
