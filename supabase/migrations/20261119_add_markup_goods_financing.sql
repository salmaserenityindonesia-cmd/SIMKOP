-- Migration: 20261119_add_markup_goods_financing.sql
-- Description: Menambahkan dukungan Skema Pembiayaan Barang Berbasis Markup Harga (Murabahah)
--              tanpa bunga di samping Pinjaman Tunai 0% Bunga (CASH_ZERO_INTEREST).

-- 1. Perluas tabel public.loan_types
ALTER TABLE public.loan_types
ADD COLUMN IF NOT EXISTS financing_scheme TEXT NOT NULL DEFAULT 'CASH_ZERO_INTEREST';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'loan_types_financing_scheme_check'
          AND conrelid = 'public.loan_types'::regclass
    ) THEN
        ALTER TABLE public.loan_types
        ADD CONSTRAINT loan_types_financing_scheme_check
        CHECK (financing_scheme IN ('CASH_ZERO_INTEREST', 'GOODS_MARKUP'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.loan_types
ADD COLUMN IF NOT EXISTS default_markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loan_types
ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Seed produk default Pembiayaan Barang (Markup Margin) jika belum tersedia
INSERT INTO public.loan_types (
    code,
    name,
    max_duration_months,
    is_active,
    financing_scheme,
    default_markup_percent,
    interest_rate
)
SELECT
    'PEMBIAYAAN_BARANG',
    'Pembiayaan Barang (Markup Margin)',
    24,
    true,
    'GOODS_MARKUP',
    0,
    0
WHERE NOT EXISTS (
    SELECT 1
    FROM public.loan_types
    WHERE UPPER(code) = 'PEMBIAYAAN_BARANG'
);

-- 2. Perluas tabel public.loans dengan rincian barang, harga modal, dan markup margin
ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS item_description TEXT;

ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS cost_price NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Backfill aman untuk pinjaman tunai lama (0% bunga, 0 markup)
UPDATE public.loans
SET cost_price = COALESCE(NULLIF(principal_amount, 0), amount, 0),
    markup_amount = 0
WHERE COALESCE(cost_price, 0) = 0
  AND COALESCE(markup_amount, 0) = 0;

-- 3. Perluas tabel public.loan_schedules dengan pemisahan porsi pokok vs margin
ALTER TABLE public.loan_schedules
ADD COLUMN IF NOT EXISTS principal_portion NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loan_schedules
ADD COLUMN IF NOT EXISTS margin_portion NUMERIC(15,2) NOT NULL DEFAULT 0;

UPDATE public.loan_schedules
SET principal_portion = COALESCE(target_amount, 0),
    margin_portion = 0
WHERE COALESCE(principal_portion, 0) = 0
  AND COALESCE(margin_portion, 0) = 0;

-- 4. Perluas tabel public.loan_repayments dengan pemisahan porsi pokok vs margin
ALTER TABLE public.loan_repayments
ADD COLUMN IF NOT EXISTS principal_portion NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.loan_repayments
ADD COLUMN IF NOT EXISTS margin_portion NUMERIC(15,2) NOT NULL DEFAULT 0;

UPDATE public.loan_repayments
SET principal_portion = COALESCE(amount_paid, 0),
    margin_portion = 0
WHERE COALESCE(principal_portion, 0) = 0
  AND COALESCE(margin_portion, 0) = 0;

-- 5. Pastikan kolom description tersedia di public.cash_flow
ALTER TABLE public.cash_flow
ADD COLUMN IF NOT EXISTS description TEXT;

-- 6. Perbarui RPC approve_loan_atomic untuk membagi porsi pokok & margin pada loan_schedules
CREATE OR REPLACE FUNCTION public.approve_loan_atomic(
    p_loan_id UUID,
    p_start_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_loan RECORD;
    v_loan_type RECORD;
    v_i INTEGER;
    v_due_date DATE;
    v_target_amount NUMERIC;
    v_tenor INTEGER;
    v_principal NUMERIC;
    v_is_goods_markup BOOLEAN := FALSE;
    v_markup NUMERIC := 0;
    v_cost_price NUMERIC := 0;
    v_acc_principal NUMERIC := 0;
    v_acc_margin NUMERIC := 0;
    v_period_principal NUMERIC := 0;
    v_period_margin NUMERIC := 0;
    v_period_target NUMERIC := 0;
BEGIN
    IF p_loan_id IS NULL THEN
        RAISE EXCEPTION 'loanId tidak boleh kosong';
    END IF;
    IF p_start_date IS NULL THEN
        RAISE EXCEPTION 'startDate tidak boleh kosong';
    END IF;

    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pinjaman dengan ID % tidak ditemukan', p_loan_id;
    END IF;

    IF v_loan.loan_type_id IS NOT NULL THEN
        SELECT id, code, name, financing_scheme INTO v_loan_type
        FROM public.loan_types
        WHERE id = v_loan.loan_type_id;
    END IF;

    v_tenor := GREATEST(1, COALESCE(NULLIF(v_loan.tenor, 0), NULLIF(v_loan.agreed_tenor_months, 0), 1));
    v_principal := COALESCE(NULLIF(v_loan.principal_amount, 0), v_loan.amount, 0);
    v_target_amount := COALESCE(
        NULLIF(v_loan.monthly_target, 0),
        NULLIF(v_loan.planned_installment_amount, 0),
        ROUND(v_principal / v_tenor)
    );

    v_is_goods_markup := (
        COALESCE(v_loan_type.financing_scheme, '') = 'GOODS_MARKUP'
        OR UPPER(COALESCE(v_loan_type.code, '')) = 'PEMBIAYAAN_BARANG'
        OR COALESCE(v_loan.markup_amount, 0) > 0
        OR NULLIF(TRIM(COALESCE(v_loan.item_description, '')), '') IS NOT NULL
    );

    v_markup := GREATEST(0, ROUND(COALESCE(v_loan.markup_amount, 0)));
    v_cost_price := GREATEST(
        0,
        ROUND(COALESCE(NULLIF(v_loan.cost_price, 0), GREATEST(0, v_principal - v_markup)))
    );

    UPDATE public.loans
    SET status = 'active'::public.loan_status,
        disbursed_at = p_start_date,
        sisa_pinjaman = v_principal,
        updated_at = NOW()
    WHERE id = p_loan_id;

    DELETE FROM public.loan_schedules
    WHERE loan_id = p_loan_id;

    FOR v_i IN 1..v_tenor LOOP
        v_due_date := (p_start_date + (v_i || ' month')::interval)::DATE;

        IF v_is_goods_markup THEN
            IF v_i < v_tenor THEN
                v_period_principal := ROUND(v_cost_price / v_tenor);
                v_period_margin := ROUND(v_markup / v_tenor);
                v_acc_principal := v_acc_principal + v_period_principal;
                v_acc_margin := v_acc_margin + v_period_margin;
            ELSE
                v_period_principal := GREATEST(0, v_cost_price - v_acc_principal);
                v_period_margin := GREATEST(0, v_markup - v_acc_margin);
            END IF;
            v_period_target := v_period_principal + v_period_margin;
        ELSE
            v_period_target := v_target_amount;
            v_period_principal := v_target_amount;
            v_period_margin := 0;
        END IF;

        INSERT INTO public.loan_schedules (
            loan_id,
            period_number,
            due_date,
            target_amount,
            principal_portion,
            margin_portion,
            paid_amount,
            status
        ) VALUES (
            p_loan_id,
            v_i,
            v_due_date,
            v_period_target,
            v_period_principal,
            v_period_margin,
            0,
            'unpaid'
        );
    END LOOP;

    INSERT INTO public.audit_logs (
        table_name,
        action,
        record_id,
        entity_name,
        entity_id,
        new_data,
        notes,
        created_at
    ) VALUES (
        'loans',
        'APPROVE',
        p_loan_id::TEXT,
        'loans',
        p_loan_id,
        jsonb_build_object(
            'id', v_loan.id,
            'status', 'active',
            'disbursed_at', p_start_date,
            'sisa_pinjaman', v_principal,
            'tenor', v_tenor,
            'monthly_target', v_target_amount,
            'cost_price', v_cost_price,
            'markup_amount', v_markup
        ),
        'Pengajuan pinjaman disetujui dan diaktifkan (' || p_start_date::TEXT || ')',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', v_loan.id,
        'member_id', v_loan.member_id,
        'status', 'active',
        'disbursed_at', p_start_date,
        'amount', v_principal,
        'tenor', v_tenor,
        'monthly_target', v_target_amount,
        'schedules_count', v_tenor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Perbarui RPC record_loan_repayment_atomic untuk memisahkan pokok vs margin dan mencatat cash_flow
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

        v_is_fully_paid := (v_new_paid >= v_target) OR (ABS(v_target - v_new_paid) <= 5);
        v_new_paid_total := CASE WHEN v_is_fully_paid THEN v_target ELSE v_new_paid END;
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

    v_new_loan_status := CASE WHEN v_is_all_paid THEN 'paid_off' ELSE 'active' END;

    UPDATE public.loans
    SET status = v_new_loan_status::public.loan_status,
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

GRANT EXECUTE ON FUNCTION public.approve_loan_atomic(UUID, DATE) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_loan_repayment_atomic(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
