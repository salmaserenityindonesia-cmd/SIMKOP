-- Migration 020: Create Cashier Shifts Table & Sales Relation
-- Phase 24: Shift Buka & Tutup Kasir dengan Rekonsiliasi Kas Kecil POS

-- 1. Create cashier_shifts table
CREATE TABLE IF NOT EXISTS public.cashier_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cashier_id UUID NOT NULL REFERENCES public.pengelola(id) ON DELETE CASCADE,
    shift_number TEXT NOT NULL UNIQUE,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    initial_cash NUMERIC NOT NULL DEFAULT 0 CHECK (initial_cash >= 0),
    cash_sales NUMERIC DEFAULT 0 CHECK (cash_sales >= 0),
    expected_cash NUMERIC DEFAULT 0,
    actual_cash NUMERIC DEFAULT 0,
    difference NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Modify sales table to reference cashier_shifts
ALTER TABLE public.sales 
    ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status 
    ON public.cashier_shifts(cashier_id, status);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opened_at 
    ON public.cashier_shifts(opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_shift_id 
    ON public.sales(shift_id);

-- 4. Enable Row Level Security (RLS) & Policies
ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read cashier_shifts" ON public.cashier_shifts;
CREATE POLICY "Allow read cashier_shifts" 
    ON public.cashier_shifts FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Allow manage cashier_shifts" ON public.cashier_shifts;
CREATE POLICY "Allow manage cashier_shifts" 
    ON public.cashier_shifts FOR ALL 
    USING (auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'authenticated');
