-- Migration: 20261124_fix_overpayment_schedule_recalc.sql
-- Description: Preserve real paid_amount on overpayment in record_loan_repayment_atomic
--              and deduct overpayment tail-first from subsequent unpaid/partial schedules.

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
    v_overpayment NUMERIC := 0;
    v_remaining_deduction NUMERIC := 0;
    v_future_sched RECORD;
    v_f_target NUMERIC := 0;
    v_f_paid NUMERIC := 0;
    v_f_remaining NUMERIC := 0;
    v_deduct NUMERIC := 0;
    v_updated_target NUMERIC := 0;
    v_upd_margin NUMERIC := 0;
    v_upd_principal NUMERIC := 0;
    v_repayment_id UUID;
    v_actual_receipt_number TEXT;
    v_principal NUMERIC;
    v_total_paid_all NUMERIC;
    v_sisa_pinjaman NUMERIC;
    v_is_all_paid BOOLEAN;
    v_new_loan_status TEXT;
    v_other_active_loans_count INTEGER;
    v_member_record RECORD;
    v_member_nrp TEXT;
    v_member_nama TEXT;
    v_member_segment TEXT := '';
    v_remaining_payment NUMERIC;
    v_shortfall NUMERIC;
    v_pay_chunk NUMERIC;
    v_sched_cursor RECORD;
    v_last_repayment_id UUID := NULL;
    v_last_receipt_number TEXT := NULL;
    v_margin_portion NUMERIC := 0;
    v_principal_portion NUMERIC := 0;
    v_cf_desc TEXT;
    v_fmt_pokok TEXT;
    v_fmt_margin TEXT;
BEGIN
    IF p_loan_id IS NULL THEN
        RAISE EXCEPTION 'loanId tidak boleh kosong';
    END IF;
    IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
        RAISE EXCEPTION 'Jumlah pembayaran harus lebih besar dari 0';
    END IF;

    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pinjaman dengan ID % tidak ditemukan', p_loan_id;
    END IF;

    v_payment_clean := ROUND(COALESCE(p_amount_paid, 0));
    v_principal := COALESCE(v_loan.principal_amount, v_loan.amount, 0);

    -- Ambil identitas anggota untuk deskripsi arus kas
    BEGIN
        SELECT NULLIF(TRIM(nrp), ''), NULLIF(TRIM(nama), '')
        INTO v_member_nrp, v_member_nama
        FROM public.anggota
        WHERE id = v_loan.member_id;

        IF v_member_nrp IS NOT NULL AND v_member_nama IS NOT NULL THEN
            v_member_segment := v_member_nrp || ' - ' || v_member_nama;
        ELSIF v_member_nama IS NOT NULL THEN
            v_member_segment := v_member_nama;
        ELSIF v_member_nrp IS NOT NULL THEN
            v_member_segment := v_member_nrp;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- =========================================================================
    -- BRANCH A: Pembayaran khusus 1 baris jadwal tertentu (paySchedule)
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

        v_is_fully_paid := (v_new_paid >= v_target) OR (ABS(v_target - v_new_paid) <= 5);
        v_new_paid_total := CASE
            WHEN v_new_paid >= v_target THEN v_new_paid
            WHEN v_is_fully_paid THEN v_target
            ELSE v_new_paid
        END;
        v_new_sched_status := CASE
            WHEN v_is_fully_paid THEN 'paid'
            WHEN v_new_paid_total > 0 THEN 'partial'
            ELSE 'unpaid'
        END;

        -- Hitung pemisahan pokok & margin proporsional
        IF COALESCE(v_schedule.margin_portion, 0) > 0 AND v_target > 0 THEN
            IF v_is_fully_paid AND v_current_paid = 0 THEN
                v_margin_portion := LEAST(v_payment_clean, ROUND(v_schedule.margin_portion));
            ELSE
                v_margin_portion := LEAST(v_payment_clean, ROUND((v_payment_clean * v_schedule.margin_portion) / v_target));
            END IF;
        ELSIF COALESCE(v_loan.markup_amount, 0) > 0 AND v_principal > 0 THEN
            v_margin_portion := LEAST(v_payment_clean, ROUND((v_payment_clean * v_loan.markup_amount) / v_principal));
        ELSE
            v_margin_portion := 0;
        END IF;
        v_principal_portion := GREATEST(0, v_payment_clean - v_margin_portion);

        UPDATE public.loan_schedules
        SET paid_amount = v_new_paid_total,
            status = v_new_sched_status
        WHERE id = p_schedule_id;

        -- Jika terjadi pembayaran lebih, kurangkan ke sisa jadwal berikutnya dari belakang ke depan
        v_overpayment := GREATEST(0, v_new_paid_total - v_target);
        IF v_overpayment > 0 THEN
            v_remaining_deduction := v_overpayment;
            FOR v_future_sched IN
                SELECT * FROM public.loan_schedules
                WHERE loan_id = p_loan_id
                  AND period_number > v_schedule.period_number
                  AND status != 'paid'
                ORDER BY period_number DESC
                FOR UPDATE
            LOOP
                EXIT WHEN v_remaining_deduction <= 0;
                v_f_target := ROUND(COALESCE(v_future_sched.target_amount, 0));
                v_f_paid := ROUND(COALESCE(v_future_sched.paid_amount, 0));
                v_f_remaining := GREATEST(0, v_f_target - v_f_paid);
                CONTINUE WHEN v_f_remaining <= 0;

                v_deduct := LEAST(v_remaining_deduction, v_f_remaining);
                v_updated_target := GREATEST(0, v_f_target - v_deduct);
                v_remaining_deduction := v_remaining_deduction - v_deduct;

                IF COALESCE(v_future_sched.margin_portion, 0) > 0 AND v_f_target > 0 THEN
                    v_upd_margin := LEAST(v_updated_target, ROUND((v_updated_target * v_future_sched.margin_portion) / v_f_target));
                    v_upd_principal := GREATEST(0, v_updated_target - v_upd_margin);
                ELSE
                    v_upd_margin := 0;
                    v_upd_principal := v_updated_target;
                END IF;

                UPDATE public.loan_schedules
                SET target_amount = v_updated_target,
                    principal_portion = v_upd_principal,
                    margin_portion = v_upd_margin,
                    status = CASE
                        WHEN v_updated_target <= v_f_paid THEN 'paid'
                        WHEN v_f_paid > 0 THEN 'partial'
                        ELSE 'unpaid'
                    END
                WHERE id = v_future_sched.id;
            END LOOP;
        END IF;

        INSERT INTO public.loan_repayments (
            loan_id,
            schedule_id,
            amount_paid,
            principal_portion,
            margin_portion,
            payment_method,
            notes,
            receipt_number
        ) VALUES (
            p_loan_id,
            p_schedule_id,
            v_payment_clean,
            v_principal_portion,
            v_margin_portion,
            COALESCE(p_payment_method, 'CASH'),
            COALESCE(p_notes, 'Pelunasan parsial jadwal periode terkait'),
            NULLIF(TRIM(COALESCE(p_receipt_number, '')), '')
        ) RETURNING id, receipt_number INTO v_repayment_id, v_actual_receipt_number;

        BEGIN
            IF v_margin_portion > 0 THEN
                v_fmt_pokok := REPLACE(TRIM(TO_CHAR(v_principal_portion, '999,999,999,999')), ',', '.');
                v_fmt_margin := REPLACE(TRIM(TO_CHAR(v_margin_portion, '999,999,999,999')), ',', '.');
                v_cf_desc := 'Angsuran Pembiayaan Barang (' || COALESCE(NULLIF(TRIM(v_loan.item_description), ''), v_loan.loan_number, 'Barang') || ') Bln ke-' || COALESCE(v_schedule.period_number::TEXT, '-')
                    || CASE WHEN v_member_segment <> '' THEN ' — ' || v_member_segment ELSE '' END
                    || ' | Pokok: Rp ' || v_fmt_pokok || ' | Margin: Rp ' || v_fmt_margin;
            ELSE
                v_cf_desc := 'Angsuran Pinjaman (' || COALESCE(v_loan.loan_number, p_loan_id::TEXT) || ') Bln ke-' || COALESCE(v_schedule.period_number::TEXT, '-')
                    || CASE WHEN v_member_segment <> '' THEN ' — ' || v_member_segment ELSE '' END;
            END IF;

            INSERT INTO public.cash_flow (
                direction,
                amount,
                category,
                reference_id,
                description
            ) VALUES (
                'in',
                v_payment_clean,
                'angsuran_pinjaman',
                v_repayment_id,
                v_cf_desc
            );
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;

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

                IF COALESCE(v_sched_cursor.margin_portion, 0) > 0 AND v_target > 0 THEN
                    IF v_is_fully_paid AND v_current_paid = 0 THEN
                        v_margin_portion := LEAST(v_pay_chunk, ROUND(v_sched_cursor.margin_portion));
                    ELSE
                        v_margin_portion := LEAST(v_pay_chunk, ROUND((v_pay_chunk * v_sched_cursor.margin_portion) / v_target));
                    END IF;
                ELSIF COALESCE(v_loan.markup_amount, 0) > 0 AND v_principal > 0 THEN
                    v_margin_portion := LEAST(v_pay_chunk, ROUND((v_pay_chunk * v_loan.markup_amount) / v_principal));
                ELSE
                    v_margin_portion := 0;
                END IF;
                v_principal_portion := GREATEST(0, v_pay_chunk - v_margin_portion);

                UPDATE public.loan_schedules
                SET paid_amount = v_new_paid_total,
                    status = v_new_sched_status
                WHERE id = v_sched_cursor.id;

                INSERT INTO public.loan_repayments (
                    loan_id,
                    schedule_id,
                    amount_paid,
                    principal_portion,
                    margin_portion,
                    payment_method,
                    notes,
                    receipt_number
                ) VALUES (
                    p_loan_id,
                    v_sched_cursor.id,
                    v_pay_chunk,
                    v_principal_portion,
                    v_margin_portion,
                    COALESCE(p_payment_method, 'CASH'),
                    COALESCE(p_notes, 'Pembayaran angsuran pinjaman (FIFO)'),
                    NULLIF(TRIM(COALESCE(p_receipt_number, '')), '')
                ) RETURNING id, receipt_number INTO v_last_repayment_id, v_last_receipt_number;

                BEGIN
                    IF v_margin_portion > 0 THEN
                        v_fmt_pokok := REPLACE(TRIM(TO_CHAR(v_principal_portion, '999,999,999,999')), ',', '.');
                        v_fmt_margin := REPLACE(TRIM(TO_CHAR(v_margin_portion, '999,999,999,999')), ',', '.');
                        v_cf_desc := 'Angsuran Pembiayaan Barang (' || COALESCE(NULLIF(TRIM(v_loan.item_description), ''), v_loan.loan_number, 'Barang') || ') Bln ke-' || COALESCE(v_sched_cursor.period_number::TEXT, '-')
                            || CASE WHEN v_member_segment <> '' THEN ' — ' || v_member_segment ELSE '' END
                            || ' | Pokok: Rp ' || v_fmt_pokok || ' | Margin: Rp ' || v_fmt_margin;
                    ELSE
                        v_cf_desc := 'Angsuran Pinjaman (' || COALESCE(v_loan.loan_number, p_loan_id::TEXT) || ') Bln ke-' || COALESCE(v_sched_cursor.period_number::TEXT, '-')
                            || CASE WHEN v_member_segment <> '' THEN ' — ' || v_member_segment ELSE '' END;
                    END IF;

                    INSERT INTO public.cash_flow (
                        direction,
                        amount,
                        category,
                        reference_id,
                        description
                    ) VALUES (
                        'in',
                        v_pay_chunk,
                        'angsuran_pinjaman',
                        v_last_repayment_id,
                        v_cf_desc
                    );
                EXCEPTION
                    WHEN OTHERS THEN NULL;
                END;

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

    SELECT NOT EXISTS (
        SELECT 1 FROM public.loan_schedules
        WHERE loan_id = p_loan_id
          AND status != 'paid'
          AND ABS(ROUND(target_amount) - ROUND(paid_amount)) > 5
    ) INTO v_is_all_paid;

    v_is_all_paid := (v_sisa_pinjaman <= 0) OR v_is_all_paid;
    v_new_loan_status := CASE WHEN v_is_all_paid THEN 'paid_off' ELSE 'active' END;

    UPDATE public.loans
    SET status = v_new_loan_status::public.loan_status,
        sisa_pinjaman = v_sisa_pinjaman,
        updated_at = NOW()
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

GRANT EXECUTE ON FUNCTION public.record_loan_repayment_atomic(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
