-- Migration: 052_create_store_credit_installments.sql
-- Description: Skema persistensi rencana tenor konsolidasi bon toko (store_credit_installment_plans)
--              dan jadwal angsuran bon toko (store_credit_schedules) terisolasi dari modul pinjaman kas.

-- 1. Tabel Rencana Tenor Konsolidasi Bon Toko
CREATE TABLE IF NOT EXISTS public.store_credit_installment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    latest_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    previous_unpaid_balance NUMERIC NOT NULL DEFAULT 0,
    new_credit_amount NUMERIC NOT NULL DEFAULT 0,
    total_consolidated_debt NUMERIC NOT NULL,
    tenor_months INTEGER NOT NULL CHECK (tenor_months >= 1),
    monthly_installment NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'paid_off')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeks tabel rencana konsolidasi bon toko
CREATE INDEX IF NOT EXISTS idx_sc_plans_member_status ON public.store_credit_installment_plans(member_id, status);
CREATE INDEX IF NOT EXISTS idx_sc_plans_latest_sale ON public.store_credit_installment_plans(latest_sale_id);
CREATE INDEX IF NOT EXISTS idx_sc_plans_created_at ON public.store_credit_installment_plans(created_at DESC);

-- Enable RLS untuk store_credit_installment_plans
ALTER TABLE public.store_credit_installment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on store_credit_installment_plans" ON public.store_credit_installment_plans;
CREATE POLICY "Allow all on store_credit_installment_plans"
    ON public.store_credit_installment_plans
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 2. Tabel Jadwal Angsuran Bon Toko (Buku Bantu Jadwal Bon Toko)
CREATE TABLE IF NOT EXISTS public.store_credit_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.store_credit_installment_plans(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    period_number INTEGER NOT NULL,
    due_year INTEGER NOT NULL,
    due_month INTEGER NOT NULL,
    due_date DATE NOT NULL,
    target_amount NUMERIC NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
    paid_at TIMESTAMPTZ,
    receipt_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeks tabel jadwal angsuran bon toko
CREATE INDEX IF NOT EXISTS idx_sc_schedules_plan_id ON public.store_credit_schedules(plan_id);
CREATE INDEX IF NOT EXISTS idx_sc_schedules_member_status ON public.store_credit_schedules(member_id, status);
CREATE INDEX IF NOT EXISTS idx_sc_schedules_due_period ON public.store_credit_schedules(due_year, due_month);
CREATE INDEX IF NOT EXISTS idx_sc_schedules_due_date ON public.store_credit_schedules(due_date);

-- Enable RLS untuk store_credit_schedules
ALTER TABLE public.store_credit_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on store_credit_schedules" ON public.store_credit_schedules;
CREATE POLICY "Allow all on store_credit_schedules"
    ON public.store_credit_schedules
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 3. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
