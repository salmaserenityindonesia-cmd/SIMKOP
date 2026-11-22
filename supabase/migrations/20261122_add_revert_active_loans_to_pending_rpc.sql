-- Migration: 20261122_add_revert_active_loans_to_pending_rpc.sql
-- Description: Fungsi PostgreSQL RPC atomik (SECURITY DEFINER) untuk mengembalikan seluruh
--              kontrak pinjaman berstatus Berjalan/Aktif ke status Pending ('draft'),
--              membersihkan jadwal angsuran (loan_schedules / loan_installments),
--              riwayat pembayaran (loan_repayments), serta entri Kas Keluar pencairan
--              terkait di public.cash_flow dalam satu transaksi atomik.

CREATE OR REPLACE FUNCTION public.revert_active_loans_to_pending(
  p_confirmation_phrase TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_loan_ids UUID[];
  v_count INTEGER := 0;
  v_deleted_cash_flow INTEGER := 0;
  v_deleted_repayments INTEGER := 0;
  v_deleted_schedules INTEGER := 0;
  v_deleted_installments INTEGER := 0;
  v_status_udt TEXT;
  v_set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Otorisasi role: wajib admin atau operator jika dipanggil melalui PostgREST JWT
  IF NULLIF(current_setting('request.jwt.claim.role', true), '') IS NOT NULL
     AND current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('admin', 'operator') THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang diizinkan menjalankan reset pinjaman.';
  END IF;

  -- 2. Validasi frasa konfirmasi persis (case-sensitive)
  IF COALESCE(TRIM(p_confirmation_phrase), '') <> 'RESET PINJAMAN' THEN
    RAISE EXCEPTION 'Frase konfirmasi tidak valid. Ketik tepat: RESET PINJAMAN';
  END IF;

  -- 3. Ambil seluruh ID kontrak pinjaman yang berstatus berjalan / disetujui aktif
  SELECT ARRAY_AGG(id)
  INTO v_target_loan_ids
  FROM public.loans
  WHERE LOWER(COALESCE(status::TEXT, '')) IN ('berjalan', 'active', 'approved', 'disbursed');

  v_count := COALESCE(array_length(v_target_loan_ids, 1), 0);

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'reverted_count', 0,
      'deleted_cash_flow', 0,
      'deleted_schedules', 0,
      'deleted_repayments', 0,
      'message', 'Tidak ada pinjaman berstatus Berjalan untuk dikembalikan ke Pending.'
    );
  END IF;

  -- 4. Bersihkan entri cash_flow pencairan/mutasi yang terikat pada kontrak tersebut
  IF to_regclass('public.cash_flow') IS NOT NULL THEN
    DELETE FROM public.cash_flow
    WHERE reference_id = ANY(v_target_loan_ids);
    GET DIAGNOSTICS v_deleted_cash_flow = ROW_COUNT;
  END IF;

  -- 5. Bersihkan riwayat pembayaran angsuran yang terikat pada kontrak tersebut
  IF to_regclass('public.loan_repayments') IS NOT NULL THEN
    DELETE FROM public.loan_repayments
    WHERE loan_id = ANY(v_target_loan_ids);
    GET DIAGNOSTICS v_deleted_repayments = ROW_COUNT;
  END IF;

  -- 6. Bersihkan jadwal angsuran di loan_schedules (dan tabel legacy loan_installments bila ada)
  IF to_regclass('public.loan_schedules') IS NOT NULL THEN
    DELETE FROM public.loan_schedules
    WHERE loan_id = ANY(v_target_loan_ids);
    GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;
  END IF;

  IF to_regclass('public.loan_installments') IS NOT NULL THEN
    DELETE FROM public.loan_installments
    WHERE loan_id = ANY(v_target_loan_ids);
    GET DIAGNOSTICS v_deleted_installments = ROW_COUNT;
    v_deleted_schedules := v_deleted_schedules + COALESCE(v_deleted_installments, 0);
  END IF;

  -- 7. Kembalikan status seluruh kontrak berjalan ke 'draft' (Menunggu Persetujuan / Pending)
  --    secara aman menyesuaikan tipe kolom status (ENUM loan_status vs TEXT) dan kolom opsional
  SELECT udt_name
  INTO v_status_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'loans'
    AND column_name = 'status';

  IF v_status_udt = 'loan_status' THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'status = ''draft''::public.loan_status');
  ELSE
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'status = ''draft''');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'disbursed_at'
  ) THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'disbursed_at = NULL');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'approved_at'
  ) THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'approved_at = NULL');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'approved_by'
  ) THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'approved_by = NULL');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'sisa_pinjaman'
  ) THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'sisa_pinjaman = 0');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'updated_at'
  ) THEN
    v_set_clauses := ARRAY_APPEND(v_set_clauses, 'updated_at = NOW()');
  END IF;

  EXECUTE 'UPDATE public.loans SET ' || ARRAY_TO_STRING(v_set_clauses, ', ') || ' WHERE id = ANY($1)'
  USING v_target_loan_ids;

  -- 8. Catat ringkasan aksi di audit_logs (best-effort)
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    BEGIN
      INSERT INTO public.audit_logs (
        table_name,
        action,
        record_id,
        notes,
        new_data,
        created_at
      ) VALUES (
        'loans',
        'REVERT_TO_PENDING',
        'BULK',
        format('Admin mengembalikan %s pinjaman berjalan ke status Menunggu Persetujuan (draft).', v_count),
        jsonb_build_object(
          'reverted_count', v_count,
          'deleted_cash_flow', v_deleted_cash_flow,
          'deleted_schedules', v_deleted_schedules,
          'deleted_repayments', v_deleted_repayments
        ),
        NOW()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reverted_count', v_count,
    'deleted_cash_flow', v_deleted_cash_flow,
    'deleted_schedules', v_deleted_schedules,
    'deleted_repayments', v_deleted_repayments,
    'message', format('%s pinjaman berhasil dikembalikan ke status Menunggu Persetujuan (Pending).', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revert_active_loans_to_pending(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_active_loans_to_pending(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.revert_active_loans_to_pending(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
