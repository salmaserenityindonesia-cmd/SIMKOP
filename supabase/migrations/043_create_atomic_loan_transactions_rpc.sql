-- Migration: 043_create_atomic_loan_transactions_rpc.sql
-- Description: Transaksi Atomic Simpan Pinjam RPC (approve_loan_atomic & record_loan_repayment_atomic)
-- Membungkus approval pinjaman beserta auto-generation loan_schedules,
-- serta mutasi pembayaran angsuran (paySchedule & makePayment FIFO) ke dalam transaksi ACID atomik.

-- 1. Fungsi RPC: approve_loan_atomic
CREATE OR REPLACE FUNCTION public.approve_loan_atomic(
    p_loan_id UUID,
    p_start_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_loan RECORD;
    v_i INTEGER;
    v_due_date DATE;
    v_target_amount NUMERIC;
    v_tenor INTEGER;
    v_principal NUMERIC;
    v_existing_schedules_count INTEGER;
BEGIN
    -- Validasi parameter
    IF p_loan_id IS NULL THEN
        RAISE EXCEPTION 'loanId tidak boleh kosong';
    END IF;
    IF p_start_date IS NULL THEN
        RAISE EXCEPTION 'startDate tidak boleh kosong';
    END IF;

    -- 1. Kunci dan ambil baris pinjaman
    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pinjaman dengan ID % tidak ditemukan', p_loan_id;
    END IF;

    v_tenor := COALESCE(v_loan.tenor, 1);
    v_target_amount := COALESCE(v_loan.monthly_target, 0);
    v_principal := COALESCE(v_loan.principal_amount, v_loan.amount, 0);

    -- 2. Update pinjaman ke status approved dan catat disbursed_at serta inisialisasi sisa_pinjaman
    UPDATE public.loans
    SET status = 'approved',
        disbursed_at = p_start_date::timestamptz,
        start_date = p_start_date,
        sisa_pinjaman = v_principal
    WHERE id = p_loan_id;

    -- 3. Bersihkan jadwal yang mungkin sudah ada sebelumnya untuk menghindari duplikasi
    DELETE FROM public.loan_schedules
    WHERE loan_id = p_loan_id;

    -- 4. Generate baris loan_schedules secara atomik
    FOR v_i IN 1..v_tenor LOOP
        v_due_date := (p_start_date + (v_i || ' month')::interval)::DATE;
        INSERT INTO public.loan_schedules (
            loan_id,
            period_number,
            due_date,
            target_amount,
            paid_amount,
            status
        ) VALUES (
            p_loan_id,
            v_i,
            v_due_date,
            v_target_amount,
            0,
            'unpaid'
        );
    END LOOP;

    -- 5. Return payload JSON hasil approval
    RETURN jsonb_build_object(
        'success', true,
        'id', v_loan.id,
        'member_id', v_loan.member_id,
        'status', 'approved',
        'disbursed_at', p_start_date,
        'amount', v_principal,
        'tenor', v_tenor,
        'monthly_target', v_target_amount,
        'schedules_count', v_tenor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fungsi RPC: record_loan_repayment_atomic
CREATE OR REPLACE FUNCTION public.record_loan_repayment_atomic(
    p_loan_id UUID,
    p_amount_paid NUMERIC,
    p_payment_method TEXT DEFAULT 'CASH',
    p_schedule_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_receipt_number TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_loan RECORD;
    v_schedule RECORD;
    v_payment_clean NUMERIC;
    v_current_paid NUMERIC;
    v_new_paid NUMERIC;
    v_target NUMERIC;
    v_is_fully_paid BOOLEAN;
    v_new_paid_total NUMERIC;
    v_new_sched_status TEXT;
    v_repayment_id UUID;
    v_actual_receipt_number TEXT;
    v_principal NUMERIC;
    v_total_paid_all NUMERIC;
    v_sisa_pinjaman NUMERIC;
    v_is_all_paid BOOLEAN;
    v_new_loan_status TEXT;
    v_other_active_loans_count INTEGER;
    v_member_record RECORD;
    -- Variabel untuk branch FIFO
    v_remaining_payment NUMERIC;
    v_shortfall NUMERIC;
    v_pay_chunk NUMERIC;
    v_sched_cursor RECORD;
    v_last_repayment_id UUID := NULL;
    v_last_receipt_number TEXT := NULL;
BEGIN
    -- Validasi input
    IF p_loan_id IS NULL THEN
        RAISE EXCEPTION 'loanId tidak boleh kosong';
    END IF;
    IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
        RAISE EXCEPTION 'Jumlah pembayaran harus lebih besar dari 0';
    END IF;

    -- 1. Kunci baris pinjaman utama
    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pinjaman dengan ID % tidak ditemukan', p_loan_id;
    END IF;

    v_payment_clean := ROUND(COALESCE(p_amount_paid, 0));
    v_principal := COALESCE(v_loan.principal_amount, v_loan.amount, 0);

    -- =========================================================================
    -- BRANCH A: Pembayaran terisolasi khusus 1 baris jadwal tertentu (paySchedule)
    -- =========================================================================
    IF p_schedule_id IS NOT NULL THEN
        SELECT * INTO v_schedule
        FROM public.loan_schedules
        WHERE id = p_schedule_id AND loan_id = p_loan_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Jadwal angsuran tidak ditemukan untuk pinjaman ini';
        END IF;

        v_current_paid := ROUND(COALESCE(v_schedule.paid_amount, 0));
        v_new_paid := v_current_paid + v_payment_clean;
        v_target := ROUND(COALESCE(v_schedule.target_amount, 0));

        -- Toleransi pembulatan +/- 5 Rupiah untuk pelunasan akhir
        v_is_fully_paid := (v_new_paid >= v_target) OR (ABS(v_target - v_new_paid) <= 5);
        v_new_paid_total := CASE WHEN v_is_fully_paid THEN v_target ELSE v_new_paid END;
        v_new_sched_status := CASE 
            WHEN v_is_fully_paid THEN 'paid'
            WHEN v_new_paid_total > 0 THEN 'partial'
            ELSE 'unpaid'
        END;

        -- Update baris jadwal angsuran
        UPDATE public.loan_schedules
        SET paid_amount = v_new_paid_total,
            status = v_new_sched_status
        WHERE id = p_schedule_id;

        -- Catat mutasi di loan_repayments
        INSERT INTO public.loan_repayments (
            loan_id,
            schedule_id,
            amount_paid,
            payment_method,
            notes,
            receipt_number
        ) VALUES (
            p_loan_id,
            p_schedule_id,
            v_payment_clean,
            COALESCE(p_payment_method, 'CASH'),
            COALESCE(p_notes, 'Pelunasan parsial jadwal periode terkait'),
            NULLIF(TRIM(COALESCE(p_receipt_number, '')), '')
        ) RETURNING id, receipt_number INTO v_repayment_id, v_actual_receipt_number;

    -- =========================================================================
    -- BRANCH B: Pembayaran FIFO across schedules (makePayment)
    -- =========================================================================
    ELSE
        v_remaining_payment := v_payment_clean;

        FOR v_sched_cursor IN 
            SELECT * FROM public.loan_schedules
            WHERE loan_id = p_loan_id AND status IN ('unpaid', 'partial')
            ORDER BY period_number ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining_payment <= 0;

            v_target := ROUND(COALESCE(v_sched_cursor.target_amount, 0));
            v_current_paid := ROUND(COALESCE(v_sched_cursor.paid_amount, 0));
            v_shortfall := GREATEST(0, v_target - v_current_paid);
            v_pay_chunk := LEAST(v_remaining_payment, v_shortfall);

            IF v_pay_chunk > 0 THEN
                v_new_paid := v_current_paid + v_pay_chunk;
                v_is_fully_paid := (v_new_paid >= v_target) OR (ABS(v_target - v_new_paid) <= 5);
                v_new_paid_total := CASE WHEN v_is_fully_paid THEN v_target ELSE v_new_paid END;
                v_new_sched_status := CASE 
                    WHEN v_is_fully_paid THEN 'paid'
                    WHEN v_new_paid_total > 0 THEN 'partial'
                    ELSE 'unpaid'
                END;

                UPDATE public.loan_schedules
                SET paid_amount = v_new_paid_total,
                    status = v_new_sched_status
                WHERE id = v_sched_cursor.id;

                INSERT INTO public.loan_repayments (
                    loan_id,
                    schedule_id,
                    amount_paid,
                    payment_method,
                    notes,
                    receipt_number
                ) VALUES (
                    p_loan_id,
                    v_sched_cursor.id,
                    v_pay_chunk,
                    COALESCE(p_payment_method, 'CASH'),
                    COALESCE(p_notes, 'Pembayaran angsuran pinjaman (FIFO)'),
                    NULLIF(TRIM(COALESCE(p_receipt_number, '')), '')
                ) RETURNING id, receipt_number INTO v_last_repayment_id, v_last_receipt_number;

                v_remaining_payment := v_remaining_payment - v_pay_chunk;
            END IF;
        END LOOP;

        v_repayment_id := v_last_repayment_id;
        v_actual_receipt_number := v_last_receipt_number;
    END IF;

    -- =========================================================================
    -- REKALKULASI TOTAL PINJAMAN INDUK (ACID)
    -- =========================================================================
    SELECT COALESCE(SUM(paid_amount), 0) INTO v_total_paid_all
    FROM public.loan_schedules
    WHERE loan_id = p_loan_id;

    v_sisa_pinjaman := GREATEST(0, v_principal - v_total_paid_all);

    -- Cek apakah seluruh jadwal telah lunas
    SELECT NOT EXISTS (
        SELECT 1 FROM public.loan_schedules
        WHERE loan_id = p_loan_id
          AND status != 'paid'
          AND ABS(ROUND(target_amount) - ROUND(paid_amount)) > 5
    ) INTO v_is_all_paid;

    v_new_loan_status := CASE WHEN v_is_all_paid THEN 'paid_off' ELSE 'active' END;

    -- Update pinjaman induk
    UPDATE public.loans
    SET status = v_new_loan_status,
        sisa_pinjaman = v_sisa_pinjaman
    WHERE id = p_loan_id;

    -- =========================================================================
    -- AUTO-DETECTION: MEMBER RESIGNATION STATUS CLEARANCE
    -- =========================================================================
    IF v_is_all_paid AND v_loan.member_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_other_active_loans_count
        FROM public.loans
        WHERE member_id = v_loan.member_id
          AND id != p_loan_id
          AND status IN ('approved', 'active');

        IF v_other_active_loans_count = 0 THEN
            SELECT * INTO v_member_record
            FROM public.anggota
            WHERE id = v_loan.member_id;

            IF FOUND AND v_member_record.membership_status = 'PENDING_RESIGNED' THEN
                UPDATE public.anggota
                SET membership_status = 'READY_TO_RESIGN'
                WHERE id = v_loan.member_id;
            END IF;
        END IF;
    END IF;

    -- Return JSON respons
    RETURN jsonb_build_object(
        'success', true,
        'newStatus', v_new_sched_status,
        'newPaidTotal', v_new_paid_total,
        'sisaPinjaman', v_sisa_pinjaman,
        'isAllPaid', v_is_all_paid,
        'excess_amount', COALESCE(v_remaining_payment, 0),
        'repayment_id', v_repayment_id,
        'receipt_number', v_actual_receipt_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Berikan Hak Akses Eksekusi RPC
GRANT EXECUTE ON FUNCTION public.approve_loan_atomic(UUID, DATE) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_loan_repayment_atomic(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.approve_loan_atomic IS 'Menyetujui pinjaman dan menghasilkan seluruh baris loan_schedules dalam satu transaksi ACID';
COMMENT ON FUNCTION public.record_loan_repayment_atomic IS 'Mencatat pembayaran cicilan angsuran (terisolasi per jadwal atau FIFO), mengupdate sisa pinjaman dan status resign anggota dalam satu transaksi ACID';
