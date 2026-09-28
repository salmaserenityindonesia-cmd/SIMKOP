-- File: supabase/migrations/009_member_settlement.sql
-- Tujuan: Membuat fungsi kalkulasi settlement (clearance) anggota koperasi

-- 1. Fungsi untuk mendapatkan rincian simpanan anggota
CREATE OR REPLACE FUNCTION public.get_member_deposit_settlement(p_member_id UUID)
RETURNS TABLE (
    deposit_name TEXT,
    can_be_withdrawn BOOLEAN,
    total_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dt.name AS deposit_name,
        dt.can_be_withdrawn,
        COALESCE(SUM(tx.amount), 0) AS total_amount
    FROM public.member_deposits md
    JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
    LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
    WHERE md.member_id = p_member_id
    GROUP BY dt.name, dt.can_be_withdrawn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fungsi untuk mendapatkan rincian pinjaman aktif anggota
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
        l.amount AS principal_amount,
        l.tenor,
        COALESCE(SUM(lr.amount_paid), 0) AS total_paid,
        (l.amount - COALESCE(SUM(lr.amount_paid), 0)) AS remaining_balance
    FROM public.loans l
    LEFT JOIN public.loan_repayments lr ON lr.loan_id = l.id
    WHERE l.member_id = p_member_id
      AND l.status IN ('approved', 'active')
    GROUP BY l.id, l.loan_number, l.notes, l.amount, l.tenor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fungsi utama clearance (proses pengunduran diri)
CREATE OR REPLACE FUNCTION public.process_member_clearance(p_member_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_net_settlement NUMERIC;
    v_total_hak NUMERIC;
    v_total_kewajiban NUMERIC;
BEGIN
    -- 1. Cek apakah hak cukup untuk menutupi kewajiban
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_hak
    FROM public.get_member_deposit_settlement(p_member_id);

    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_total_kewajiban
    FROM public.get_member_loan_settlement(p_member_id);

    v_net_settlement := v_total_hak - v_total_kewajiban;

    IF v_net_settlement < 0 THEN
        RAISE EXCEPTION 'Anggota masih memiliki defisit utang sebesar % yang harus dilunasi.', ABS(v_net_settlement);
    END IF;

    -- 2. Update status pinjaman menjadi completed
    UPDATE public.loans
    SET status = 'completed'
    WHERE member_id = p_member_id AND status IN ('approved', 'active');

    -- 3. Update status anggota menjadi keluar/resigned
    UPDATE public.anggota
    SET status = 'keluar'
    WHERE id = p_member_id;

    -- (Optional) Log audit clearance could be added here
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
