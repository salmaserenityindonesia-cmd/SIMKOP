CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_number TEXT NOT NULL UNIQUE,
    member_id UUID REFERENCES public.anggota(id) ON DELETE SET NULL,
    cashier_id UUID REFERENCES public.pengelola(id) ON DELETE SET NULL,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    paid_cash NUMERIC NOT NULL DEFAULT 0,
    paid_deposit NUMERIC NOT NULL DEFAULT 0,
    paid_credit NUMERIC NOT NULL DEFAULT 0,
    payment_scheme TEXT NOT NULL DEFAULT 'cash' CHECK (payment_scheme IN ('cash', 'split', 'store_credit')),
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Add basic policies
CREATE POLICY "Enable all for sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for sale_items" ON public.sale_items FOR ALL USING (true) WITH CHECK (true);
