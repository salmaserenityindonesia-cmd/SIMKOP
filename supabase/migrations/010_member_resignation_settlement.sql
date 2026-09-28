-- File: supabase/migrations/010_member_resignation_settlement.sql
-- Tujuan: Menambahkan kolom status pengunduran diri dan tabel log clearance, beserta fungsi RPC clearance yang baru.

-- 1. Penambahan Kolom Status Pengunduran Diri pada public.anggota jika belum ada
ALTER TABLE public.anggota 
ADD COLUMN IF NOT EXISTS membership_status VARCHAR(30) DEFAULT 'ACTIVE' 
CHECK (membership_status IN ('ACTIVE', 'PENDING_RESIGNED', 'READY_TO_RESIGN', 'RESIGNED', 'BLOCKED'));

-- Jika tabel sudah punya status = 'nonaktif', kita mapping agar terpusat ke membership_status
UPDATE public.anggota SET membership_status = 'RESIGNED' WHERE status = 'nonaktif';

-- Pastikan ENUM loan_status memiliki nilai 'completed' jika menggunakan ENUM
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_status') THEN
    ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'completed';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- 2. Tabel Settlement / Kliring Log
CREATE TABLE IF NOT EXISTS public.member_clearance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anggota_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    settlement_type VARCHAR(30) NOT NULL CHECK (settlement_type IN ('INSTANT_PAYOFF', 'TRANSFERRED_TO_DEBTOR', 'SURPLUS_PAYOUT')),
    total_savings NUMERIC(15,2) NOT NULL,
    total_loans NUMERIC(15,2) NOT NULL,
    net_amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50),
    notes TEXT,
    processed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.member_clearance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pengelola can manage member_clearance_logs" ON public.member_clearance_logs;
CREATE POLICY "Pengelola can manage member_clearance_logs" 
ON public.member_clearance_logs FOR ALL 
USING ( (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') );


-- 3. Fungsi RPC untuk Opsi Surplus atau Pelunasan Seketika (Instant Payoff)
CREATE OR REPLACE FUNCTION public.process_instant_payoff_clearance(
    p_member_id UUID, 
    p_payment_method VARCHAR, 
    p_notes TEXT, 
    p_processed_by UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_total_hak NUMERIC;
    v_total_kewajiban NUMERIC;
    v_net_settlement NUMERIC;
    v_settlement_type VARCHAR;
BEGIN
    -- Hitung total hak dan kewajiban
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_hak
    FROM public.get_member_deposit_settlement(p_member_id);

    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_total_kewajiban
    FROM public.get_member_loan_settlement(p_member_id);

    v_net_settlement := v_total_hak - v_total_kewajiban;
    
    IF v_net_settlement >= 0 THEN
        v_settlement_type := 'SURPLUS_PAYOUT';
    ELSE
        v_settlement_type := 'INSTANT_PAYOFF';
        -- Simulasikan setoran sisa pelunasan (defisit) ke loan_repayments jika ada pinjaman
        -- Pada Opsi A, defisit dilunasi cash/transfer secara eksternal lalu diakui lunas di sini
    END IF;

    -- Tarik seluruh simpanan (dianggap ditarik/dicairkan)
    -- Ini bisa dilakukan dengan insert transaksi negatif atau sekadar mark as closed, tapi karena sistem ini 
    -- mengandalkan aggregasi, kita bisa biarkan history, tapi state anggota keluar menandakan simpanan tak aktif.

    -- Update pinjaman menjadi completed
    UPDATE public.loans
    SET status = 'completed'
    WHERE member_id = p_member_id AND status IN ('approved', 'active');

    -- Update status anggota
    UPDATE public.anggota
    SET status = 'nonaktif', membership_status = 'RESIGNED'
    WHERE id = p_member_id;

    -- Catat log
    INSERT INTO public.member_clearance_logs (
        anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, processed_by
    ) VALUES (
        p_member_id, v_settlement_type, v_total_hak, v_total_kewajiban, v_net_settlement, p_payment_method, p_notes, p_processed_by
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Fungsi RPC untuk Opsi Transisi Piutang Eks-Anggota (Pending Resigned)
CREATE OR REPLACE FUNCTION public.process_debtor_transition_clearance(
    p_member_id UUID, 
    p_notes TEXT, 
    p_processed_by UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_total_hak NUMERIC;
    v_total_kewajiban NUMERIC;
    v_net_settlement NUMERIC;
BEGIN
    -- Opsi B hanya bisa jika ada defisit
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_hak
    FROM public.get_member_deposit_settlement(p_member_id);

    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_total_kewajiban
    FROM public.get_member_loan_settlement(p_member_id);

    v_net_settlement := v_total_hak - v_total_kewajiban;
    
    IF v_net_settlement >= 0 THEN
        RAISE EXCEPTION 'Opsi Piutang hanya berlaku untuk anggota dengan defisit (utang melebihi simpanan).';
    END IF;

    -- 1. Semua hak simpanan digunakan (disetorkan) ke pinjaman
    -- Sebagai simplifikasi, kita asumsikan v_total_hak langsung memotong pokok total,
    -- Namun karena loan_repayments terkait ke loan_id spesifik, secara ideal harus dialokasikan.
    -- (Untuk MVP SIMKOP, ini cukup mencatat di log dan mengubah membership_status).
    
    -- 2. Ubah membership_status
    UPDATE public.anggota
    SET membership_status = 'PENDING_RESIGNED'
    WHERE id = p_member_id;
    -- Biarkan status dasar tetap aktif agar bisa dicicil, atau setel status khusus jika app support.
    
    -- Catat log
    INSERT INTO public.member_clearance_logs (
        anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, processed_by
    ) VALUES (
        p_member_id, 'TRANSFERRED_TO_DEBTOR', v_total_hak, v_total_kewajiban, v_net_settlement, NULL, p_notes, p_processed_by
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
