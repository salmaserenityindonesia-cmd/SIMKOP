-- Migration: 20261122_add_reset_all_members_rpc.sql
-- Description: Fungsi PostgreSQL RPC atomik (SECURITY DEFINER) untuk mengosongkan tabel public.anggota
--              beserta seluruh tabel anak/turunan menggunakan TRUNCATE TABLE ... RESTART IDENTITY CASCADE,
--              membersihkan tabel legacy public.members (jika ada), serta menyinkronkan pembersihan
--              entri cash_flow terkait transaksi anggota.

CREATE OR REPLACE FUNCTION public.reset_all_members_data(
  p_confirmation_phrase TEXT DEFAULT 'RESET ANGGOTA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_members_deleted INTEGER := 0;
  v_cash_flow_deleted INTEGER := 0;
BEGIN
  IF COALESCE(TRIM(p_confirmation_phrase), '') <> 'RESET ANGGOTA' THEN
    RAISE EXCEPTION 'Konfirmasi tidak valid. Ketik tepat: RESET ANGGOTA';
  END IF;

  SELECT COUNT(*) INTO v_members_deleted FROM public.anggota;

  -- Kosongkan tabel anggota beserta seluruh tabel turunan (simpanan, pinjaman, distribusi SHU, dll.)
  -- dan reset sequence identity kembali ke 1.
  TRUNCATE TABLE public.anggota RESTART IDENTITY CASCADE;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'members'
  ) THEN
    EXECUTE 'TRUNCATE TABLE public.members RESTART IDENTITY CASCADE;';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'cash_flow'
  ) THEN
    DELETE FROM public.cash_flow
    WHERE category ILIKE '%SIMPANAN%'
       OR category ILIKE '%PINJAMAN%'
       OR category ILIKE '%ANGSURAN%'
       OR category ILIKE '%MARGIN%'
       OR category ILIKE '%SHU%'
       OR category ILIKE '%LEBARAN%'
       OR category ILIKE '%BON%'
       OR category ILIKE '%PENJUALAN%'
       OR category ILIKE '%POS%'
       OR category ILIKE '%RESIGN%';
    GET DIAGNOSTICS v_cash_flow_deleted = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
  ) THEN
    BEGIN
      INSERT INTO public.audit_logs (table_name, action, record_id, notes)
      VALUES (
        'anggota',
        'RESET_ALL',
        'SYSTEM',
        'Admin melakukan reset massal seluruh data anggota melalui TRUNCATE CASCADE.'
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'members_deleted', COALESCE(v_members_deleted, 0),
    'cash_flow_deleted', COALESCE(v_cash_flow_deleted, 0),
    'message', 'Seluruh data anggota dan mutasi terkait berhasil dikosongkan.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_members_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_members_data(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
