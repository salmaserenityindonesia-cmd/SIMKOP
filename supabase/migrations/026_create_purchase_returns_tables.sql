-- Migration: 026_create_purchase_returns_tables.sql
-- Description: Skema Database Retur Pembelian ke Supplier & Atomic Restock Claim RPC (Phase 32)
--              Menyediakan tabel suppliers, purchase_returns, purchase_return_items,
--              indeks pencarian, kebijakan RLS, serta RPC complete_return_claim.

-- 1. Pastikan tabel public.suppliers tersedia
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pastikan kolom tabel suppliers lengkap jika sudah ada sebelumnya
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

-- 2. Buat tabel master public.purchase_returns
CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number TEXT NOT NULL UNIQUE,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT,
    original_invoice_number TEXT,
    return_type TEXT NOT NULL CHECK (return_type IN ('BARANG_RUSAK', 'PIUTANG_PENGGANTIAN')),
    claim_status TEXT NOT NULL DEFAULT 'MENUNGGU_PENGGANTIAN' CHECK (claim_status IN ('MENUNGGU_PENGGANTIAN', 'SELESAI_DIGANTI', 'HAPUS_BUKU')),
    total_amount NUMERIC NOT NULL DEFAULT 0.00,
    replacement_received_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pastikan kolom tabel purchase_returns lengkap jika tabel pernah dibuat
ALTER TABLE public.purchase_returns
    ADD COLUMN IF NOT EXISTS return_number TEXT,
    ADD COLUMN IF NOT EXISTS return_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS supplier_id UUID,
    ADD COLUMN IF NOT EXISTS supplier_name TEXT,
    ADD COLUMN IF NOT EXISTS original_invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS return_type TEXT DEFAULT 'BARANG_RUSAK',
    ADD COLUMN IF NOT EXISTS claim_status TEXT DEFAULT 'MENUNGGU_PENGGANTIAN',
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS replacement_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Buat tabel detail public.purchase_return_items
CREATE TABLE IF NOT EXISTS public.purchase_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL CHECK (qty > 0),
    cost_per_unit NUMERIC NOT NULL DEFAULT 0.00,
    subtotal NUMERIC NOT NULL DEFAULT 0.00,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.purchase_return_items
    ADD COLUMN IF NOT EXISTS return_id UUID,
    ADD COLUMN IF NOT EXISTS product_id UUID,
    ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Pastikan kolom updated_at tersedia di tabel public.products
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Indeks Performa Kueri
CREATE INDEX IF NOT EXISTS idx_purchase_returns_number ON public.purchase_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON public.purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON public.purchase_returns(return_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON public.purchase_returns(claim_status);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON public.purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON public.purchase_return_items(product_id);

-- 5. Row Level Security (RLS) & Policies
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pengelola can manage suppliers" ON public.suppliers;
CREATE POLICY "Pengelola can manage suppliers" 
ON public.suppliers FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
)
WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Pengelola can manage purchase_returns" ON public.purchase_returns;
CREATE POLICY "Pengelola can manage purchase_returns" 
ON public.purchase_returns FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
)
WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Pengelola can manage purchase_return_items" ON public.purchase_return_items;
CREATE POLICY "Pengelola can manage purchase_return_items" 
ON public.purchase_return_items FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
)
WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR (auth.jwt() ->> 'role') IN ('admin', 'operator')
    OR auth.role() = 'authenticated'
);

GRANT ALL ON TABLE public.suppliers TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.purchase_returns TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.purchase_return_items TO authenticated, anon, service_role;

-- 6. Fungsi RPC Atomik: complete_return_claim
CREATE OR REPLACE FUNCTION public.complete_return_claim(
    p_return_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_actual_user_id UUID := p_user_id;
    v_actual_user_name TEXT;
    v_items_count INT := 0;
    v_total_restocked_qty INT := 0;
    v_audit_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- a. Validasi foreign key auth.users untuk v_actual_user_id agar tidak melanggar constraint
    IF v_actual_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actual_user_id) THEN
            v_actual_user_id := NULL;
        END IF;
    END IF;

    -- Dapatkan nama user/pengelola jika ada
    IF p_user_id IS NOT NULL THEN
        SELECT COALESCE(nama, 'Pengelola') INTO v_actual_user_name
        FROM public.pengelola
        WHERE id = p_user_id;
    END IF;
    IF v_actual_user_name IS NULL THEN
        v_actual_user_name := 'Pengelola';
    END IF;

    -- b. Kunci baris retur dan validasi status retur
    SELECT * INTO v_return
    FROM public.purchase_returns
    WHERE id = p_return_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data retur pembelian dengan ID % tidak ditemukan.', p_return_id;
    END IF;

    IF v_return.return_type <> 'PIUTANG_PENGGANTIAN' THEN
        RAISE EXCEPTION 'Hanya retur bertipe PIUTANG_PENGGANTIAN yang dapat diselesaikan klaim penggantian barangnya (tipe saat ini: %).', v_return.return_type;
    END IF;

    IF v_return.claim_status <> 'MENUNGGU_PENGGANTIAN' THEN
        RAISE EXCEPTION 'Status klaim retur bukan MENUNGGU_PENGGANTIAN (status saat ini: %). Klaim sudah diproses sebelumnya.', v_return.claim_status;
    END IF;

    -- c. Restock seluruh item produk yang diretur kembali ke inventori
    FOR v_item IN
        SELECT product_id, qty
        FROM public.purchase_return_items
        WHERE return_id = p_return_id
    LOOP
        -- Kunci baris master produk untuk integritas konkurensi
        PERFORM 1 FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        UPDATE public.products
        SET 
            stock = stock + v_item.qty,
            updated_at = v_now
        WHERE id = v_item.product_id;

        v_items_count := v_items_count + 1;
        v_total_restocked_qty := v_total_restocked_qty + v_item.qty;
    END LOOP;

    -- d. Perbarui status header retur pembelian
    UPDATE public.purchase_returns
    SET 
        claim_status = 'SELESAI_DIGANTI',
        replacement_received_at = v_now,
        updated_at = v_now
    WHERE id = p_return_id;

    -- e. Catat jejak audit ke tabel public.audit_logs jika tabel tersedia
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        INSERT INTO public.audit_logs (
            table_name,
            action,
            record_id,
            entity_name,
            entity_id,
            old_data,
            new_data,
            performed_by,
            performer_name,
            notes,
            created_at
        ) VALUES (
            'purchase_returns',
            'COMPLETE_CLAIM',
            p_return_id::text,
            'purchase_returns',
            p_return_id,
            to_jsonb(v_return),
            jsonb_build_object(
                'claim_status', 'SELESAI_DIGANTI',
                'replacement_received_at', v_now,
                'items_restocked', v_items_count,
                'total_restocked_qty', v_total_restocked_qty
            ),
            v_actual_user_id,
            v_actual_user_name,
            COALESCE(p_notes, 'Barang pengganti dari supplier telah diterima dan stok ditambahkan kembali ke inventori'),
            v_now
        ) RETURNING id INTO v_audit_id;
    END IF;

    -- f. Kembalikan respons JSON status berhasil
    RETURN jsonb_build_object(
        'success', true,
        'return_id', p_return_id,
        'claim_status', 'SELESAI_DIGANTI',
        'items_restocked', v_items_count,
        'total_restocked_qty', v_total_restocked_qty,
        'audit_log_id', v_audit_id,
        'completed_at', v_now
    );
END;
$$;

-- Berikan hak eksekusi RPC ke peran terkait
GRANT EXECUTE ON FUNCTION public.complete_return_claim(UUID, UUID, TEXT) TO authenticated, anon, service_role;
