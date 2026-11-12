-- Migration: 035_lebaran_cycle_replay_and_recipients.sql
-- Description: Pencatatan Riwayat Penerima, Tanggal Pencairan Historis,
--              dan RPC Simulasi Pengosongan Ulang (Replay) Simpanan Lebaran

-- 1. Pastikan kolom-kolom pada tabel public.lebaran_disbursement_cycles lengkap
CREATE TABLE IF NOT EXISTS public.lebaran_disbursement_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_name TEXT NOT NULL,
    disbursement_date DATE,
    cut_off_date TIMESTAMPTZ,
    source_type TEXT NOT NULL DEFAULT 'MASSAL' CHECK (source_type IN ('HISTORICAL_INPUT', 'MASSAL', 'MANUAL')),
    total_members INTEGER DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('DRAFT', 'APPROVED', 'COMPLETED', 'REJECTED')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Penyesuaian skema jika tabel sudah ada dari migrasi sebelumnya
DO $$
BEGIN
    -- Tambah kolom disbursement_date jika belum ada
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'lebaran_disbursement_cycles' AND column_name = 'disbursement_date'
    ) THEN
        ALTER TABLE public.lebaran_disbursement_cycles ADD COLUMN disbursement_date DATE;
    END IF;

    -- Tambah kolom source_type jika belum ada
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'lebaran_disbursement_cycles' AND column_name = 'source_type'
    ) THEN
        ALTER TABLE public.lebaran_disbursement_cycles ADD COLUMN source_type TEXT NOT NULL DEFAULT 'MASSAL';
    END IF;

    -- Backfill disbursement_date dari cut_off_date atau created_at jika bernilai NULL
    UPDATE public.lebaran_disbursement_cycles 
    SET disbursement_date = COALESCE(cut_off_date::date, created_at::date, CURRENT_DATE)
    WHERE disbursement_date IS NULL;

    -- Set disbursement_date NOT NULL
    ALTER TABLE public.lebaran_disbursement_cycles ALTER COLUMN disbursement_date SET NOT NULL;

    -- Tambahkan constraint UNIQUE pada disbursement_date jika belum ada
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_lebaran_disbursement_cycles_date'
    ) THEN
        ALTER TABLE public.lebaran_disbursement_cycles 
        ADD CONSTRAINT uq_lebaran_disbursement_cycles_date UNIQUE (disbursement_date);
    END IF;
END $$;

-- Pastikan tabel anggota memiliki kolom joined_at jika digunakan di filter
ALTER TABLE public.anggota ADD COLUMN IF NOT EXISTS joined_at DATE;

-- Indeks pendukung untuk tabel siklus
CREATE INDEX IF NOT EXISTS idx_lebaran_cycles_disb_date ON public.lebaran_disbursement_cycles(disbursement_date DESC);
CREATE INDEX IF NOT EXISTS idx_lebaran_cycles_source_type ON public.lebaran_disbursement_cycles(source_type);

-- RLS untuk tabel siklus
ALTER TABLE public.lebaran_disbursement_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on lebaran_disbursement_cycles" ON public.lebaran_disbursement_cycles;
CREATE POLICY "Allow all on lebaran_disbursement_cycles"
    ON public.lebaran_disbursement_cycles
    FOR ALL
    TO authenticated, anon, service_role
    USING (true)
    WITH CHECK (true);

-- 2. Buat tabel detail penerima per siklus: public.lebaran_disbursement_items
CREATE TABLE IF NOT EXISTS public.lebaran_disbursement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.lebaran_disbursement_cycles(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    nrp TEXT,
    member_name TEXT,
    bank_account TEXT,
    amount_disbursed NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indeks untuk tabel item penerima
CREATE INDEX IF NOT EXISTS idx_lebaran_items_cycle_id ON public.lebaran_disbursement_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_lebaran_items_member_id ON public.lebaran_disbursement_items(member_id);

-- RLS untuk tabel item penerima
ALTER TABLE public.lebaran_disbursement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on lebaran_disbursement_items" ON public.lebaran_disbursement_items;
CREATE POLICY "Allow all on lebaran_disbursement_items"
    ON public.lebaran_disbursement_items
    FOR ALL
    TO authenticated, anon, service_role
    USING (true)
    WITH CHECK (true);

-- 3. Fungsi RPC Atomik: replay_lebaran_disbursement_cycles()
-- Membersihkan mutasi pencairan simpanan lebaran sebelumnya dan menghitung ulang secara berantai
-- dari tanggal tertua hingga tanggal terbaru berdasarkan saldo riil pada masing-masing tanggal.
CREATE OR REPLACE FUNCTION public.replay_lebaran_disbursement_cycles()
RETURNS JSONB AS $$
DECLARE
    r_cycle RECORD;
    r_member RECORD;
    v_total_cycles INTEGER := 0;
    v_total_recipients_all INTEGER := 0;
    v_total_amount_all NUMERIC := 0;
    v_cycle_members INTEGER;
    v_cycle_amount NUMERIC;
    v_ref_no TEXT;
    v_year TEXT;
    v_tx_id UUID;
BEGIN
    -- 1. Bersihkan seluruh transaksi penarikan simpanan lebaran hasil pencairan/replay sebelumnya
    DELETE FROM public.deposit_transactions
    WHERE transaction_type = 'withdrawal'
      AND (
          description ILIKE '%Pencairan%Simpanan Lebaran%'
          OR description ILIKE '%Pencairan Massal Simpanan Lebaran%'
          OR notes ILIKE '%Pencairan%Simpanan Lebaran%'
          OR reference_no ILIKE 'KW-THR-%'
      );

    -- 2. Bersihkan seluruh rincian item penerima lama
    DELETE FROM public.lebaran_disbursement_items;

    -- 3. Iterasi seluruh siklus pencairan berurutan dari tanggal tertua (ASC)
    FOR r_cycle IN 
        SELECT id, cycle_name, disbursement_date, source_type
        FROM public.lebaran_disbursement_cycles
        ORDER BY disbursement_date ASC
    LOOP
        v_total_cycles := v_total_cycles + 1;
        v_cycle_members := 0;
        v_cycle_amount := 0;
        v_year := TO_CHAR(r_cycle.disbursement_date, 'YYYY');

        -- Cari anggota yang bergabung pada atau sebelum tanggal siklus
        -- dan hitung saldo riil simpanan lebaran mereka per tanggal r_cycle.disbursement_date
        FOR r_member IN
            SELECT 
                m.id AS member_id,
                m.nrp AS member_nrp,
                m.nama AS member_nama,
                m.bank_account_number AS member_bank_account,
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
                AND COALESCE(tx.transaction_date, tx.created_at::date) <= r_cycle.disbursement_date
            WHERE (
                dt.code ILIKE '%LEBARAN%' 
                OR dt.code = 'SL' 
                OR dt.code = 'THR'
                OR dt.name ILIKE '%LEBARAN%' 
                OR dt.name ILIKE '%HARI RAYA%'
            )
            AND COALESCE(m.joined_at, m.created_at::date) <= r_cycle.disbursement_date
            GROUP BY m.id, m.nrp, m.nama, m.bank_account_number, md.id
            HAVING COALESCE(SUM(
                CASE 
                    WHEN tx.transaction_type = 'deposit' THEN tx.amount 
                    WHEN tx.transaction_type = 'withdrawal' THEN -tx.amount 
                    ELSE 0 
                END
            ), 0) > 0
            ORDER BY m.nama ASC
        LOOP
            v_ref_no := 'KW-THR-' || v_year || '-' || COALESCE(NULLIF(TRIM(r_member.member_nrp), ''), 'ANGGOTA');

            -- Sisipkan mutasi penarikan ke deposit_transactions
            INSERT INTO public.deposit_transactions (
                member_deposit_id,
                transaction_date,
                transaction_type,
                amount,
                description,
                reference_no,
                payment_method,
                notes,
                created_at
            ) VALUES (
                r_member.member_deposit_id,
                r_cycle.disbursement_date,
                'withdrawal',
                r_member.current_balance,
                'Pencairan Massal Simpanan Lebaran - ' || r_cycle.cycle_name,
                v_ref_no,
                'transfer',
                'Pencairan Simpanan Lebaran (Replay Timeline)',
                (r_cycle.disbursement_date::text || ' 12:00:00+00')::timestamptz
            ) RETURNING id INTO v_tx_id;

            -- Sisipkan rincian penerima ke lebaran_disbursement_items
            INSERT INTO public.lebaran_disbursement_items (
                cycle_id,
                member_id,
                nrp,
                member_name,
                bank_account,
                amount_disbursed,
                created_at
            ) VALUES (
                r_cycle.id,
                r_member.member_id,
                r_member.member_nrp,
                r_member.member_nama,
                r_member.member_bank_account,
                r_member.current_balance,
                (r_cycle.disbursement_date::text || ' 12:00:00+00')::timestamptz
            );

            v_cycle_members := v_cycle_members + 1;
            v_cycle_amount := v_cycle_amount + r_member.current_balance;
        END LOOP;

        -- Perbarui statistik total penerima & nominal pada baris siklus
        UPDATE public.lebaran_disbursement_cycles
        SET total_members = v_cycle_members,
            total_amount = v_cycle_amount,
            status = 'COMPLETED',
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = r_cycle.id;

        v_total_recipients_all := v_total_recipients_all + v_cycle_members;
        v_total_amount_all := v_total_amount_all + v_cycle_amount;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'total_cycles', v_total_cycles,
        'total_recipients', v_total_recipients_all,
        'total_amount', v_total_amount_all
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Hak Akses Eksekusi RPC
GRANT EXECUTE ON FUNCTION public.replay_lebaran_disbursement_cycles() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.replay_lebaran_disbursement_cycles IS 'Mengosongkan dan menjalankan simulasi ulang pencairan simpanan lebaran berantai dari tanggal tertua hingga tanggal terbaru.';

