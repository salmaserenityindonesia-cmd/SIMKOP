-- Migration: 053_enrich_withdrawal_cash_flow_descriptions.sql
-- Description: Menambahkan kolom description pada public.cash_flow jika belum ada,
--              memperkaya deskripsi otomatis pada RPC withdraw_savings_atomic,
--              dan mengonsolidasikan pencatatan cash_flow pada execute_bulk_lebaran_disbursement
--              menjadi 1 baris agregat per siklus pencairan massal.

-- 1. Pastikan kolom description tersedia pada public.cash_flow
ALTER TABLE public.cash_flow
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Perbarui RPC withdraw_savings_atomic untuk mencatat deskripsi informatif ke public.cash_flow
CREATE OR REPLACE FUNCTION public.withdraw_savings_atomic(
    p_member_deposit_id UUID,
    p_amount NUMERIC,
    p_description TEXT,
    p_payment_method TEXT
) RETURNS JSON AS $$
DECLARE
    v_saldo NUMERIC;
    v_tx_id UUID;
    v_member_nrp TEXT;
    v_member_nama TEXT;
    v_type_code TEXT;
    v_type_name TEXT;
    v_is_lebaran BOOLEAN := FALSE;
    v_label_jenis TEXT;
    v_member_segment TEXT := '';
    v_formatted_amount TEXT;
    v_cf_description TEXT;
BEGIN
    -- Hitung saldo terkini
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE -amount END), 0)
    INTO v_saldo
    FROM public.deposit_transactions
    WHERE member_deposit_id = p_member_deposit_id;

    IF v_saldo < p_amount THEN
        RAISE EXCEPTION 'Saldo tidak mencukupi untuk penarikan';
    END IF;

    -- Ambil metadata anggota dan jenis simpanan untuk deskripsi cash_flow
    SELECT
        NULLIF(TRIM(m.nrp), ''),
        NULLIF(TRIM(m.nama), ''),
        NULLIF(TRIM(dt.code), ''),
        NULLIF(TRIM(dt.name), '')
    INTO
        v_member_nrp,
        v_member_nama,
        v_type_code,
        v_type_name
    FROM public.member_deposits md
    LEFT JOIN public.anggota m ON m.id = md.member_id
    LEFT JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
    WHERE md.id = p_member_deposit_id;

    v_type_name := COALESCE(v_type_name, 'Simpanan Anggota');
    v_is_lebaran := (
        UPPER(COALESCE(v_type_code, '')) LIKE '%LEBARAN%'
        OR UPPER(COALESCE(v_type_code, '')) IN ('SL', 'THR', 'SHR')
        OR LOWER(v_type_name) LIKE '%lebaran%'
        OR LOWER(v_type_name) LIKE '%hari raya%'
    );

    IF v_is_lebaran AND LOWER(v_type_name) NOT LIKE '%(personal)%' THEN
        v_label_jenis := v_type_name || ' (Personal)';
    ELSE
        v_label_jenis := v_type_name;
    END IF;

    IF v_member_nrp IS NOT NULL AND v_member_nrp <> '-' AND v_member_nama IS NOT NULL AND v_member_nama <> '-' THEN
        v_member_segment := v_member_nrp || ' - ' || v_member_nama;
    ELSIF v_member_nama IS NOT NULL AND v_member_nama <> '-' THEN
        v_member_segment := v_member_nama;
    ELSIF v_member_nrp IS NOT NULL AND v_member_nrp <> '-' THEN
        v_member_segment := v_member_nrp;
    END IF;

    v_formatted_amount := REPLACE(TRIM(TO_CHAR(ROUND(p_amount), '999,999,999,999')), ',', '.');

    IF v_member_segment <> '' THEN
        v_cf_description := 'Pencairan ' || v_label_jenis || ' — ' || v_member_segment || ' (Rp ' || v_formatted_amount || ')';
    ELSE
        v_cf_description := 'Pencairan ' || v_label_jenis || ' (Rp ' || v_formatted_amount || ')';
    END IF;

    -- Insert withdrawal transaction
    INSERT INTO public.deposit_transactions (
        member_deposit_id,
        transaction_type,
        amount,
        description
    ) VALUES (
        p_member_deposit_id,
        'withdrawal',
        p_amount,
        p_description
    ) RETURNING id INTO v_tx_id;

    -- Insert cash flow out with rich description
    INSERT INTO public.cash_flow (
        direction,
        amount,
        category,
        reference_id,
        description
    ) VALUES (
        'out',
        ROUND(p_amount),
        'penarikan_simpanan',
        v_tx_id,
        v_cf_description
    );

    RETURN json_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Perbarui RPC execute_bulk_lebaran_disbursement agar mencatat tepat 1 baris agregat ke public.cash_flow
CREATE OR REPLACE FUNCTION public.execute_bulk_lebaran_disbursement(
    p_cycle_id UUID,
    p_approver_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_cycle RECORD;
    v_record RECORD;
    v_total_members INTEGER := 0;
    v_total_amount NUMERIC := 0;
    v_tx_id UUID;
    v_year TEXT;
    v_ref_no TEXT;
    v_approver_valid_id UUID := NULL;
    v_audit_table_exists BOOLEAN := FALSE;
    v_cash_flow_table_exists BOOLEAN := FALSE;
    v_formatted_total TEXT;
    v_bulk_cf_description TEXT;
BEGIN
    -- Validasi ID siklus
    IF p_cycle_id IS NULL THEN
        RAISE EXCEPTION 'ID siklus pencairan (cycle_id) wajib diisi.';
    END IF;

    -- Kunci baris siklus pencairan untuk mencegah race condition (FOR UPDATE)
    SELECT * INTO v_cycle
    FROM public.lebaran_disbursement_cycles
    WHERE id = p_cycle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siklus pencairan lebaran dengan ID % tidak ditemukan.', p_cycle_id;
    END IF;

    IF v_cycle.status NOT IN ('DRAFT', 'APPROVED') THEN
        RAISE EXCEPTION 'Siklus pencairan lebaran tidak dapat dieksekusi karena berstatus %.', v_cycle.status;
    END IF;

    -- Validasi foreign key approver jika disediakan
    v_approver_valid_id := COALESCE(p_approver_id, auth.uid());
    IF v_approver_valid_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_approver_valid_id) THEN
            v_approver_valid_id := NULL;
        END IF;
    END IF;

    -- Ambil tahun untuk penomoran kwitansi unik
    v_year := TO_CHAR(COALESCE(v_cycle.cut_off_date, NOW()), 'YYYY');

    -- Deteksi ketersediaan tabel cash_flow
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cash_flow'
    ) INTO v_cash_flow_table_exists;

    -- Iterasi setiap anggota aktif yang memiliki saldo simpanan lebaran > 0
    FOR v_record IN
        SELECT
            m.id AS member_id,
            m.nrp AS member_nrp,
            m.nama AS member_nama,
            md.id AS member_deposit_id,
            COALESCE(SUM(
                CASE
                    WHEN tx.transaction_type = 'deposit' THEN tx.amount
                    WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount
                    ELSE 0
                END
            ), 0)::NUMERIC AS current_balance
        FROM public.anggota m
        JOIN public.member_deposits md ON md.member_id = m.id
        JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
        LEFT JOIN public.deposit_transactions tx ON tx.member_deposit_id = md.id
        WHERE LOWER(m.status) = 'aktif'
          AND (
              dt.code ILIKE '%LEBARAN%'
              OR dt.code = 'SL'
              OR dt.code = 'THR'
              OR dt.name ILIKE '%LEBARAN%'
              OR dt.name ILIKE '%HARI RAYA%'
          )
        GROUP BY m.id, m.nrp, m.nama, md.id
        HAVING COALESCE(SUM(
            CASE
                WHEN tx.transaction_type = 'deposit' THEN tx.amount
                WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount
                ELSE 0
            END
        ), 0) > 0
        ORDER BY m.nama ASC
    LOOP
        -- Format nomor kwitansi unik: KW-THR-[YEAR]-[NRP]
        v_ref_no := 'KW-THR-' || v_year || '-' || COALESCE(NULLIF(TRIM(v_record.member_nrp), ''), 'ANGGOTA');

        -- Sisipkan transaksi penarikan (withdrawal 100% saldo riil)
        INSERT INTO public.deposit_transactions (
            member_deposit_id,
            transaction_date,
            transaction_type,
            amount,
            description,
            reference_no,
            payment_method,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_record.member_deposit_id,
            CURRENT_DATE,
            'withdrawal',
            v_record.current_balance,
            'Pencairan Massal Simpanan Lebaran - ' || v_cycle.cycle_name,
            v_ref_no,
            'transfer',
            'Pencairan Massal Simpanan Lebaran',
            v_approver_valid_id,
            TIMEZONE('utc'::text, NOW())
        ) RETURNING id INTO v_tx_id;

        -- Akumulasi counter dan total dana cair
        v_total_members := v_total_members + 1;
        v_total_amount := v_total_amount + v_record.current_balance;
    END LOOP;

    -- Catat 1 baris agregat pengeluaran kas ke public.cash_flow jika cash_flow tersedia
    IF v_cash_flow_table_exists AND v_total_members > 0 AND v_total_amount > 0 THEN
        BEGIN
            v_formatted_total := REPLACE(TRIM(TO_CHAR(ROUND(v_total_amount), '999,999,999,999')), ',', '.');
            v_bulk_cf_description := 'Pencairan Massal Simpanan Lebaran (' || v_cycle.cycle_name || ') — ' || v_total_members || ' Anggota (Rp ' || v_formatted_total || ')';

            INSERT INTO public.cash_flow (
                direction,
                amount,
                category,
                reference_id,
                description,
                created_at
            ) VALUES (
                'out',
                ROUND(v_total_amount),
                'penarikan_simpanan',
                p_cycle_id,
                v_bulk_cf_description,
                TIMEZONE('utc'::text, NOW())
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;

    -- Perbarui status siklus pencairan menjadi COMPLETED
    UPDATE public.lebaran_disbursement_cycles
    SET status = 'COMPLETED',
        approved_by = v_approver_valid_id,
        approved_at = TIMEZONE('utc'::text, NOW()),
        total_members = v_total_members,
        total_amount = v_total_amount,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_cycle_id;

    -- Catat jejak audit pada audit_logs jika tabel tersedia
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) INTO v_audit_table_exists;

    IF v_audit_table_exists THEN
        BEGIN
            INSERT INTO public.audit_logs (
                table_name,
                action,
                record_id,
                entity_name,
                entity_id,
                performed_by,
                performer_name,
                notes,
                new_data,
                created_at
            ) VALUES (
                'lebaran_disbursement_cycles',
                'EXECUTE',
                p_cycle_id::TEXT,
                'lebaran_disbursement_cycles',
                p_cycle_id,
                v_approver_valid_id,
                'Approver / Admin',
                'Eksekusi massal pencairan simpanan lebaran: ' || v_cycle.cycle_name || ' (' || v_total_members || ' anggota, total Rp ' || v_total_amount || ')',
                jsonb_build_object(
                    'cycle_id', p_cycle_id,
                    'cycle_name', v_cycle.cycle_name,
                    'cut_off_date', v_cycle.cut_off_date,
                    'total_members', v_total_members,
                    'total_amount', v_total_amount,
                    'approved_by', v_approver_valid_id,
                    'status', 'COMPLETED'
                ),
                TIMEZONE('utc'::text, NOW())
            );
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;

    -- Kembalikan output JSONB terstruktur
    RETURN jsonb_build_object(
        'success', true,
        'cycle_id', p_cycle_id,
        'cycle_name', v_cycle.cycle_name,
        'total_members', v_total_members,
        'total_amount', v_total_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.withdraw_savings_atomic(UUID, NUMERIC, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_bulk_lebaran_disbursement(UUID, UUID) TO authenticated, anon, service_role;
