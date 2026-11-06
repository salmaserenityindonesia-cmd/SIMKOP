-- Migration: 038_create_store_credit_payments_table.sql
-- Description: Tabel pencatatan riwayat pelunasan/cicilan bon toko retail kasir (store credit payments)

CREATE TABLE IF NOT EXISTS public.store_credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_number TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_store_credit_payments_sale ON public.store_credit_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_payments_date ON public.store_credit_payments(payment_date);

-- RLS
ALTER TABLE public.store_credit_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on store_credit_payments" ON public.store_credit_payments;
CREATE POLICY "Allow all on store_credit_payments" ON public.store_credit_payments FOR ALL USING (true) WITH CHECK (true);

