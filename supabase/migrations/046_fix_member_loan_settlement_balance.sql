-- Migration 046: Fix double negation and non-negative loan remaining balance in member clearance
-- Ensure principal_amount column exists on public.loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS principal_amount NUMERIC;

-- 1. Perbarui get_member_loan_settlement dengan GREATEST(0, ...) untuk remaining_balance
CREATE OR REPLACE FUNCTION public.get_member_loan_settlement(p_member_id UUID)
RETURNS TABLE (
    loan_id UUID,
    loan_number TEXT,
    purpose TEXT,
    principal_amount NUMERIC,
    tenor INTEGER,
    total_paid NUMERIC,
    remaining_balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id AS loan_id,
        l.loan_number,
        l.notes AS purpose,
        COALESCE(l.principal_amount, l.amount, 0) AS principal_amount,
        l.tenor,
        COALESCE(SUM(lr.amount_paid), 0) AS total_paid,
        GREATEST(0, (COALESCE(l.principal_amount, l.amount, 0) - COALESCE(SUM(lr.amount_paid), 0))) AS remaining_balance
    FROM public.loans l
    LEFT JOIN public.loan_repayments lr ON lr.loan_id = l.id
    WHERE l.member_id = p_member_id
      AND l.status IN ('approved', 'active')
    GROUP BY l.id, l.loan_number, l.notes, l.amount, l.tenor, l.principal_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Perbarui process_instant_payoff_clearance agar v_total_kewajiban selalu non-negatif
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

    v_total_kewajiban := GREATEST(0, ABS(v_total_kewajiban));
    v_net_settlement := v_total_hak - v_total_kewajiban;
    
    IF v_net_settlement >= 0 THEN
        v_settlement_type := 'SURPLUS_PAYOUT';
    ELSE
        v_settlement_type := 'INSTANT_PAYOFF';
    END IF;

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

-- 3. Perbarui process_debtor_transition_clearance agar v_total_kewajiban selalu non-negatif
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

    v_total_kewajiban := GREATEST(0, ABS(v_total_kewajiban));
    v_net_settlement := v_total_hak - v_total_kewajiban;
    
    IF v_net_settlement >= 0 THEN
        RAISE EXCEPTION 'Opsi Piutang hanya berlaku untuk anggota dengan defisit (utang melebihi simpanan).';
    END IF;

    -- Ubah membership_status
    UPDATE public.anggota
    SET membership_status = 'PENDING_RESIGNED'
    WHERE id = p_member_id;

    -- Catat log
    INSERT INTO public.member_clearance_logs (
        anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, processed_by
    ) VALUES (
        p_member_id, 'TRANSFERRED_TO_DEBTOR', v_total_hak, v_total_kewajiban, v_net_settlement, NULL, p_notes, p_processed_by
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Perbarui legacy process_member_clearance jika masih dipanggil
CREATE OR REPLACE FUNCTION public.process_member_clearance(p_member_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_net_settlement NUMERIC;
    v_total_hak NUMERIC;
    v_total_kewajiban NUMERIC;
BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_hak
    FROM public.get_member_deposit_settlement(p_member_id);

    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_total_kewajiban
    FROM public.get_member_loan_settlement(p_member_id);

    v_total_kewajiban := GREATEST(0, ABS(v_total_kewajiban));
    v_net_settlement := v_total_hak - v_total_kewajiban;

    IF v_net_settlement < 0 THEN
        RAISE EXCEPTION 'Anggota masih memiliki defisit utang sebesar % yang harus dilunasi.', ABS(v_net_settlement);
    END IF;

    -- Update status pinjaman menjadi completed
    UPDATE public.loans
    SET status = 'completed'
    WHERE member_id = p_member_id AND status IN ('approved', 'active');

    -- Update status anggota menjadi keluar/resigned
    UPDATE public.anggota
    SET status = 'nonaktif', membership_status = 'RESIGNED'
    WHERE id = p_member_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
