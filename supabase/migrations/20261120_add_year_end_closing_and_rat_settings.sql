-- Migration: 20261120_add_year_end_closing_and_rat_settings.sql
-- Description: Menambahkan modul Tutup Buku Akhir Tahun & Pembagian SHU (RAT):
--              1. public.rat_shu_settings (konfigurasi rasio & metode penyaluran SHU per tahun buku)
--              2. public.fiscal_year_closings (arsip penguncian tahun buku & saldo bawaan 1 Januari tahun baru)
--              3. public.shu_member_distributions (rincian hak SHU Jasa Modal & Jasa Usaha per anggota)

-- Pastikan kolom description tersedia pada public.cash_flow untuk jurnal penutup PEMBAGIAN_SHU_RAT
ALTER TABLE public.cash_flow
ADD COLUMN IF NOT EXISTS description TEXT;

-- 1. Tabel Konfigurasi / Setting Kebijakan RAT per Tahun Buku
CREATE TABLE IF NOT EXISTS public.rat_shu_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_year INTEGER UNIQUE NOT NULL,
    reserve_fund_pct NUMERIC(5,2) NOT NULL DEFAULT 40,
    member_shu_pct NUMERIC(5,2) NOT NULL DEFAULT 60,
    other_fund_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    member_business_pct NUMERIC(5,2) NOT NULL DEFAULT 70,
    member_capital_pct NUMERIC(5,2) NOT NULL DEFAULT 30,
    payout_method TEXT NOT NULL DEFAULT 'CASH_PAYOUT',
    target_deposit_type_code TEXT DEFAULT 'BELANJA',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rat_shu_settings_payout_method_check'
          AND conrelid = 'public.rat_shu_settings'::regclass
    ) THEN
        ALTER TABLE public.rat_shu_settings
        ADD CONSTRAINT rat_shu_settings_payout_method_check
        CHECK (payout_method IN ('CASH_PAYOUT', 'CREDIT_SAVINGS'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rat_shu_settings_main_pct_sum_check'
          AND conrelid = 'public.rat_shu_settings'::regclass
    ) THEN
        ALTER TABLE public.rat_shu_settings
        ADD CONSTRAINT rat_shu_settings_main_pct_sum_check
        CHECK (
            reserve_fund_pct >= 0 AND member_shu_pct >= 0 AND other_fund_pct >= 0
            AND ROUND(reserve_fund_pct + member_shu_pct + other_fund_pct, 2) = 100
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rat_shu_settings_member_pct_sum_check'
          AND conrelid = 'public.rat_shu_settings'::regclass
    ) THEN
        ALTER TABLE public.rat_shu_settings
        ADD CONSTRAINT rat_shu_settings_member_pct_sum_check
        CHECK (
            member_business_pct >= 0 AND member_capital_pct >= 0
            AND ROUND(member_business_pct + member_capital_pct, 2) = 100
        );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabel Arsip Tutup Buku Akhir Tahun & Pembukaan Saldo Awal Tahun Baru
CREATE TABLE IF NOT EXISTS public.fiscal_year_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_year INTEGER UNIQUE NOT NULL,
    closing_date DATE NOT NULL,
    opening_next_year_date DATE NOT NULL,
    closing_cash_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_loan_receivable NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_store_receivable NUMERIC(15,2) NOT NULL DEFAULT 0,
    closing_member_savings NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_shu_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    reserve_fund_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    member_shu_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    other_fund_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    payout_method TEXT NOT NULL DEFAULT 'CASH_PAYOUT',
    status TEXT NOT NULL DEFAULT 'CLOSED',
    notes TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kolom snapshot audit tambahan (idempoten jika tabel sudah dibuat sebelumnya)
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS gross_sales NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS cogs_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS gross_profit_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS goods_financing_margin NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS opex_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS post_shu_cash_balance NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS post_shu_member_savings NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS reserve_fund_pct NUMERIC(5,2) NOT NULL DEFAULT 40;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS member_shu_pct NUMERIC(5,2) NOT NULL DEFAULT 60;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS other_fund_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS member_business_pct NUMERIC(5,2) NOT NULL DEFAULT 70;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS member_capital_pct NUMERIC(5,2) NOT NULL DEFAULT 30;
ALTER TABLE public.fiscal_year_closings ADD COLUMN IF NOT EXISTS target_deposit_type_code TEXT DEFAULT 'BELANJA';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fiscal_year_closings_payout_method_check'
          AND conrelid = 'public.fiscal_year_closings'::regclass
    ) THEN
        ALTER TABLE public.fiscal_year_closings
        ADD CONSTRAINT fiscal_year_closings_payout_method_check
        CHECK (payout_method IN ('CASH_PAYOUT', 'CREDIT_SAVINGS'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fiscal_year_closings_status_check'
          AND conrelid = 'public.fiscal_year_closings'::regclass
    ) THEN
        ALTER TABLE public.fiscal_year_closings
        ADD CONSTRAINT fiscal_year_closings_status_check
        CHECK (status IN ('CLOSED'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Tabel Distribusi Hak SHU per Anggota
CREATE TABLE IF NOT EXISTS public.shu_member_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_id UUID NOT NULL REFERENCES public.fiscal_year_closings(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL,
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    total_savings_contribution NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_transaction_contribution NUMERIC(15,2) NOT NULL DEFAULT 0,
    jasa_modal_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    jasa_usaha_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_shu_received NUMERIC(15,2) NOT NULL DEFAULT 0,
    payout_status TEXT NOT NULL DEFAULT 'PAID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'shu_member_distributions_closing_member_unique'
          AND conrelid = 'public.shu_member_distributions'::regclass
    ) THEN
        ALTER TABLE public.shu_member_distributions
        ADD CONSTRAINT shu_member_distributions_closing_member_unique
        UNIQUE (closing_id, member_id);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 4. Indeks Pencarian Cepat
CREATE INDEX IF NOT EXISTS idx_rat_shu_settings_year ON public.rat_shu_settings(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fiscal_year_closings_year ON public.fiscal_year_closings(fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_shu_member_dist_closing ON public.shu_member_distributions(closing_id);
CREATE INDEX IF NOT EXISTS idx_shu_member_dist_year ON public.shu_member_distributions(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_shu_member_dist_member ON public.shu_member_distributions(member_id);

-- 5. Row Level Security (RLS) & Hak Akses
ALTER TABLE public.rat_shu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_year_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shu_member_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on rat_shu_settings" ON public.rat_shu_settings;
CREATE POLICY "Allow all on rat_shu_settings"
    ON public.rat_shu_settings
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on fiscal_year_closings" ON public.fiscal_year_closings;
CREATE POLICY "Allow all on fiscal_year_closings"
    ON public.fiscal_year_closings
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on shu_member_distributions" ON public.shu_member_distributions;
CREATE POLICY "Allow all on shu_member_distributions"
    ON public.shu_member_distributions
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.rat_shu_settings TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.fiscal_year_closings TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.shu_member_distributions TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
