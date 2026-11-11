-- Migration: 046_create_lebaran_disbursement_cycles.sql
-- Description: Skema persistensi siklus pencairan massal simpanan lebaran (lebaran_disbursement_cycles)
--              dan fungsi RPC PostgreSQL atomik (execute_bulk_lebaran_disbursement)
--              untuk mencairkan 100% saldo simpanan lebaran seluruh anggota aktif secara serentak.

-- 1. Buat Tabel lebaran_disbursement_cycles
CREATE TABLE IF NOT EXISTS public.lebaran_disbursement_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_name TEXT NOT NULL,
    cut_off_date TIMESTAMPTZ NOT NULL,
    total_members INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'COMPLETED', 'REJECTED')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indeks untuk query status dan cut_off_date
CREATE INDEX IF NOT EXISTS idx_lebaran_cycles_status ON public.lebaran_disbursement_cycles(status);
CREATE INDEX IF NOT EXISTS idx_lebaran_cycles_cutoff ON public.lebaran_disbursement_cycles(cut_off_date);
CREATE INDEX IF NOT EXISTS idx_lebaran_cycles_created_at ON public.lebaran_disbursement_cycles(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.lebaran_disbursement_cycles ENABLE ROW LEVEL SECURITY;

-- Policies untuk akses aplikasi
DROP POLICY IF EXISTS "Allow all on lebaran_disbursement_cycles" ON public.lebaran_disbursement_cycles;
CREATE POLICY "Allow all on lebaran_disbursement_cycles"
    ON public.lebaran_disbursement_cycles
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 2. Pastikan kolom pendukung pada deposit_transactions tersedia
ALTER TABLE public.deposit_transactions 
ADD COLUMN IF NOT EXISTS transaction_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS reference_no TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'tunai',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_tx_reference_no ON public.deposit_transactions(reference_no);

-- 3. Fungsi RPC Atomik: execute_bulk_lebaran_disbursement
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

        -- Catat pengeluaran kas jika cash_flow tersedia
        IF v_cash_flow_table_exists THEN
            BEGIN
                INSERT INTO public.cash_flow (
                    direction,
                    amount,
                    category,
                    reference_id,
                    created_at
                ) VALUES (
                    'out',
                    v_record.current_balance,
                    'penarikan_simpanan',
                    v_tx_id,
                    TIMEZONE('utc'::text, NOW())
                );
            EXCEPTION
                WHEN OTHERS THEN
                    NULL;
            END;
        END IF;

        -- Akumulasi counter dan total dana cair
        v_total_members := v_total_members + 1;
        v_total_amount := v_total_amount + v_record.current_balance;
    END LOOP;

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
        'total_members', v_total_members,
        'total_amount', v_total_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Hak Akses Eksekusi RPC
GRANT EXECUTE ON FUNCTION public.execute_bulk_lebaran_disbursement(UUID, UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.execute_bulk_lebaran_disbursement IS 'Mengeksekusi penarikan 100% saldo simpanan lebaran untuk seluruh anggota aktif secara serentak dan atomik.';
