-- Migration: 038_create_store_credit_payments_table.sql
-- Description: Tabel pencatatan riwayat pelunasan/cicilan bon toko retail kasir (store credit payments)

CREATE TABLE IF NOT EXISTS public.store_credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    member_id UUID NOT NULL REFERENCES public.anggota(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'potong_gaji' CHECK (payment_method IN ('potong_gaji', 'tunai', 'transfer')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference_no TEXT,
    notes TEXT,
    received_by UUID REFERENCES public.pengelola(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_store_credit_payments_member ON public.store_credit_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_payments_sale ON public.store_credit_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_payments_date ON public.store_credit_payments(payment_date);

-- RLS
ALTER TABLE public.store_credit_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on store_credit_payments" ON public.store_credit_payments;
CREATE POLICY "Allow all on store_credit_payments" ON public.store_credit_payments FOR ALL USING (true) WITH CHECK (true);

