-- Migration: 030_create_reset_members_and_finances_rpc.sql
-- Description: Fungsi RPC atomik untuk mereset seluruh data master anggota,
--              rekening simpanan, pinjaman, dan log audit/clearance terkait
--              sesuai urutan foreign key, serta melepaskan relasi anggota
--              pada transaksi kasir toko (sales.member_id = NULL) agar
--              omzet kasir POS tetap utuh.

CREATE OR REPLACE FUNCTION public.reset_members_and_financial_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_members_count INTEGER := 0;
    deleted_loans_count INTEGER := 0;
    deleted_deposits_count INTEGER := 0;
BEGIN
    -- 1. Bersihkan riwayat pelunasan pinjaman & cicilan tambahan
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_repayments') THEN
        DELETE FROM public.loan_repayments;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_installments') THEN
        EXECUTE 'DELETE FROM public.loan_installments';
    END IF;

    -- 2. Bersihkan jadwal tenor pinjaman
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_schedules') THEN
        DELETE FROM public.loan_schedules;
    END IF;

    -- 3. Bersihkan master pinjaman
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loans') THEN
        SELECT COUNT(*) INTO deleted_loans_count FROM public.loans;
        DELETE FROM public.loans;
    END IF;

    -- 4. Bersihkan mutasi transaksi simpanan
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deposit_transactions') THEN
        DELETE FROM public.deposit_transactions;
    END IF;

    -- 5. Bersihkan akun simpanan anggota
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'member_deposits') THEN
        SELECT COUNT(*) INTO deleted_deposits_count FROM public.member_deposits;
        DELETE FROM public.member_deposits;
    END IF;

    -- 6. Bersihkan log audit rekening dan log clearance jika tabel ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rekening_audit_logs') THEN
        EXECUTE 'DELETE FROM public.rekening_audit_logs';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'member_clearance_logs') THEN
        EXECUTE 'DELETE FROM public.member_clearance_logs';
    END IF;

    -- 7. Lepaskan relasi anggota pada penjualan POS toko agar data kasir dan omzet penjualan tetap utuh
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        UPDATE public.sales SET member_id = NULL WHERE member_id IS NOT NULL;
    END IF;

    -- 8. Kosongkan tabel anggota
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'anggota') THEN
        SELECT COUNT(*) INTO deleted_members_count FROM public.anggota;
        DELETE FROM public.anggota;
    END IF;

    -- Bersihkan tabel cadangan members jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members') THEN
        EXECUTE 'DELETE FROM public.members';
    END IF;

    -- 9. Catat aktivitas reset ke tabel public.audit_logs jika tabel tersedia
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        INSERT INTO public.audit_logs (table_name, action, record_id, notes)
        VALUES ('anggota', 'RESET_ALL', 'SYSTEM', 'Admin melakukan reset massal seluruh data anggota, simpanan, dan pinjaman.');
    END IF;

    -- 10. Kembalikan jsonb status
    RETURN jsonb_build_object(
        'success', true,
        'members_deleted', deleted_members_count,
        'loans_deleted', deleted_loans_count,
        'deposits_deleted', deleted_deposits_count,
        'message', 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.'
    );
END;
$$;

-- Berikan izin eksekusi kepada authenticated, anon, dan service_role
GRANT EXECUTE ON FUNCTION public.reset_members_and_financial_records() TO authenticated, anon, service_role;
