-- Migration 047: Otomatisasi Pelunasan Jadwal Angsuran dan Pencatatan Pembayaran saat Kliring Anggota Keluar
-- Memastikan tabel dan kolom pendukung siap
ALTER TABLE public.loan_repayments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS sisa_pinjaman NUMERIC DEFAULT 0;

-- 1. Perbarui fungsi process_instant_payoff_clearance
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
    v_loan RECORD;
    v_sched RECORD;
    v_shortfall NUMERIC;
BEGIN
    -- 1. Hitung total hak simpanan dan kewajiban pinjaman anggota
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

    -- 2. Loop setiap pinjaman aktif dan lunaskan seluruh jadwal angsuran yang belum lunas
    FOR v_loan IN 
        SELECT id FROM public.loans
        WHERE member_id = p_member_id AND status IN ('approved', 'active')
    LOOP
        FOR v_sched IN 
            SELECT id, target_amount, COALESCE(paid_amount, 0) AS paid_amount
            FROM public.loan_schedules
            WHERE loan_id = v_loan.id AND status IN ('unpaid', 'partial')
            ORDER BY period_number ASC
        LOOP
            v_shortfall := GREATEST(0, v_sched.target_amount - v_sched.paid_amount);

            -- Catat pembayaran angsuran kliring di loan_repayments jika terdapat sisa tagihan
            IF v_shortfall > 0 THEN
                INSERT INTO public.loan_repayments (
                    loan_id,
                    schedule_id,
                    amount_paid,
                    payment_method,
                    notes,
                    payment_date
                ) VALUES (
                    v_loan.id,
                    v_sched.id,
                    v_shortfall,
                    COALESCE(p_payment_method, 'POTONG_SIMPANAN_KLIRING'),
                    COALESCE(p_notes, 'Pelunasan otomatis melalui kliring anggota keluar (net settlement)'),
                    NOW()
                );
            END IF;

            -- Update jadwal angsuran menjadi paid
            UPDATE public.loan_schedules
            SET paid_amount = v_sched.target_amount,
                status = 'paid'
            WHERE id = v_sched.id;
        END LOOP;

        -- Update status pinjaman induk menjadi completed dan saldo sisa = 0
        UPDATE public.loans
        SET status = 'completed',
            sisa_pinjaman = 0
        WHERE id = v_loan.id;
    END LOOP;

    -- Update sisa pinjaman jika ada yang belum ter-update
    UPDATE public.loans
    SET status = 'completed',
        sisa_pinjaman = 0
    WHERE member_id = p_member_id AND status IN ('approved', 'active');

    -- 3. Update status anggota menjadi nonaktif & RESIGNED
    UPDATE public.anggota
    SET status = 'nonaktif', membership_status = 'RESIGNED'
    WHERE id = p_member_id;

    -- 4. Catat log kliring
    INSERT INTO public.member_clearance_logs (
        anggota_id, settlement_type, total_savings, total_loans, net_amount, payment_method, notes, processed_by
    ) VALUES (
        p_member_id, v_settlement_type, v_total_hak, v_total_kewajiban, v_net_settlement, p_payment_method, p_notes, p_processed_by
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Perbarui legacy process_member_clearance
CREATE OR REPLACE FUNCTION public.process_member_clearance(p_member_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_net_settlement NUMERIC;
    v_total_hak NUMERIC;
    v_total_kewajiban NUMERIC;
    v_loan RECORD;
    v_sched RECORD;
    v_shortfall NUMERIC;
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

    -- Pelunasan sisa jadwal angsuran pinjaman
    FOR v_loan IN 
        SELECT id FROM public.loans
        WHERE member_id = p_member_id AND status IN ('approved', 'active')
    LOOP
        FOR v_sched IN 
            SELECT id, target_amount, COALESCE(paid_amount, 0) AS paid_amount
            FROM public.loan_schedules
            WHERE loan_id = v_loan.id AND status IN ('unpaid', 'partial')
            ORDER BY period_number ASC
        LOOP
            v_shortfall := GREATEST(0, v_sched.target_amount - v_sched.paid_amount);

            IF v_shortfall > 0 THEN
                INSERT INTO public.loan_repayments (
                    loan_id,
                    schedule_id,
                    amount_paid,
                    payment_method,
                    notes,
                    payment_date
                ) VALUES (
                    v_loan.id,
                    v_sched.id,
                    v_shortfall,
                    'POTONG_SIMPANAN_KLIRING',
                    'Pelunasan otomatis melalui kliring anggota keluar (legacy)',
                    NOW()
                );
            END IF;

            UPDATE public.loan_schedules
            SET paid_amount = v_sched.target_amount,
                status = 'paid'
            WHERE id = v_sched.id;
        END LOOP;

        UPDATE public.loans
        SET status = 'completed',
            sisa_pinjaman = 0
        WHERE id = v_loan.id;
    END LOOP;

    -- Update pinjaman induk menjadi completed jika masih ada
    UPDATE public.loans
    SET status = 'completed',
        sisa_pinjaman = 0
    WHERE member_id = p_member_id AND status IN ('approved', 'active');

    -- Update status anggota menjadi keluar/resigned
    UPDATE public.anggota
    SET status = 'nonaktif', membership_status = 'RESIGNED'
    WHERE id = p_member_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
