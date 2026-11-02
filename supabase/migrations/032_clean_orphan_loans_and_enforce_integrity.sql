-- Migration: 032_clean_orphan_loans_and_enforce_integrity.sql
-- Deskripsi: Membersihkan record pinjaman yatim (orphan loans) yang tidak memiliki
--             relasi valid dengan tabel anggota (misal setelah reset anggota).

DO $$
BEGIN
    -- 1. Bersihkan riwayat pelunasan untuk pinjaman tanpa relasi anggota valid
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_repayments') THEN
        DELETE FROM public.loan_repayments
        WHERE loan_id IN (
            SELECT l.id FROM public.loans l
            LEFT JOIN public.anggota a ON l.member_id = a.id
            WHERE a.id IS NULL
        );
    END IF;

    -- 2. Bersihkan cicilan pinjaman tambahan jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_installments') THEN
        EXECUTE 'DELETE FROM public.loan_installments WHERE loan_id IN (
            SELECT l.id FROM public.loans l
            LEFT JOIN public.anggota a ON l.member_id = a.id
            WHERE a.id IS NULL
        )';
    END IF;

    -- 3. Bersihkan jadwal tenor pinjaman tanpa relasi anggota valid
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loan_schedules') THEN
        DELETE FROM public.loan_schedules
        WHERE loan_id IN (
            SELECT l.id FROM public.loans l
            LEFT JOIN public.anggota a ON l.member_id = a.id
            WHERE a.id IS NULL
        );
    END IF;

    -- 4. Bersihkan master pinjaman orphan
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loans') THEN
        DELETE FROM public.loans
        WHERE member_id NOT IN (SELECT id FROM public.anggota);
    END IF;

    RAISE NOTICE 'Pembersihan orphan loans selesai.';
END $$;

