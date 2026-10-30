-- Migration: 023_purchase_audit_and_stock_adjustment.sql
-- Description: Menambahkan tabel audit_logs terpusat, memastikan tabel purchases & purchase_items, 
--              serta mendefinisikan RPC update_purchase_invoice_atomic untuk rekonsiliasi stok dan audit trail.

-- 1. Tabel Audit Logs Terpusat
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    performer_name TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexing untuk pencarian cepat riwayat audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- Aktifkan RLS untuk audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pengelola can manage audit_logs" ON public.audit_logs;
CREATE POLICY "Pengelola can manage audit_logs" 
ON public.audit_logs FOR ALL 
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

-- 2. Memastikan Tabel purchases dan purchase_items Tersedia
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL CHECK (qty >= 0),
    buy_price NUMERIC NOT NULL CHECK (buy_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexing tabel pembelian
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON public.purchases (invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON public.purchases (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items (product_id);

-- Aktifkan RLS untuk purchases dan purchase_items
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pengelola can manage purchases" ON public.purchases;
CREATE POLICY "Pengelola can manage purchases" 
ON public.purchases FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR auth.role() = 'authenticated'
)
WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Pengelola can manage purchase_items" ON public.purchase_items;
CREATE POLICY "Pengelola can manage purchase_items" 
ON public.purchase_items FOR ALL 
USING ( 
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR auth.role() = 'authenticated'
)
WITH CHECK (
    (SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator') 
    OR auth.role() = 'authenticated'
);

-- 3. Fungsi RPC Atomik: update_purchase_invoice_atomic
CREATE OR REPLACE FUNCTION public.update_purchase_invoice_atomic(
    p_purchase_id UUID,
    p_invoice_number TEXT,
    p_purchase_date DATE,
    p_items JSONB,
    p_change_reason TEXT,
    p_user_id UUID,
    p_user_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_purchase RECORD;
    v_new_purchase RECORD;
    v_old_data JSONB;
    v_new_data JSONB;
    v_rec RECORD;
    v_prod_name TEXT;
    v_current_stock NUMERIC;
    v_total_amount NUMERIC := 0;
    v_audit_id UUID;
    v_item RECORD;
    v_actual_user_id UUID := p_user_id;
    v_actual_user_name TEXT := p_user_name;
BEGIN
    -- a. Validasi nomor faktur
    IF p_invoice_number IS NULL OR trim(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Nomor faktur pembelian harus diisi.';
    END IF;

    -- b. Validasi alasan perubahan (minimal 10 karakter)
    IF p_change_reason IS NULL OR char_length(trim(p_change_reason)) < 10 THEN
        RAISE EXCEPTION 'Alasan perubahan faktur harus diisi minimal 10 karakter.';
    END IF;

    -- c. Validasi keberadaan array items
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Faktur pembelian harus memiliki minimal satu item produk.';
    END IF;

    -- Validasi setiap item dalam array
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item.value->>'qty') IS NULL OR (v_item.value->>'qty')::INT <= 0 THEN
            RAISE EXCEPTION 'Kuantitas setiap item produk harus lebih besar dari 0.';
        END IF;
        IF (COALESCE((v_item.value->>'buy_price')::NUMERIC, (v_item.value->>'hargaBeli')::NUMERIC, -1)) < 0 THEN
            RAISE EXCEPTION 'Harga beli item produk tidak boleh negatif.';
        END IF;
    END LOOP;

    -- d. Kunci dan ambil data faktur lama
    SELECT * INTO v_old_purchase
    FROM public.purchases
    WHERE id = p_purchase_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Faktur pembelian dengan ID % tidak ditemukan.', p_purchase_id;
    END IF;

    -- Ambil snapshot data lama (faktur dan item-itemnya)
    SELECT jsonb_build_object(
        'purchase', to_jsonb(v_old_purchase),
        'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(pi))
            FROM public.purchase_items pi
            WHERE pi.purchase_id = p_purchase_id
        ), '[]'::jsonb)
    ) INTO v_old_data;

    -- e. Rekonsiliasi delta stok produk
    -- Hitung delta kuantitas per produk: delta = (new_qty - old_qty)
    FOR v_rec IN (
        SELECT 
            COALESCE(n.product_id, o.product_id) AS product_id,
            COALESCE(o.old_qty, 0) AS old_qty,
            COALESCE(n.new_qty, 0) AS new_qty,
            (COALESCE(n.new_qty, 0) - COALESCE(o.old_qty, 0)) AS delta_qty,
            n.new_buy_price
        FROM (
            SELECT 
                COALESCE((item->>'product_id')::UUID, (item->>'productId')::UUID) AS product_id,
                SUM(COALESCE((item->>'qty')::INT, 0))::INT AS new_qty,
                MAX(COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)) AS new_buy_price
            FROM jsonb_array_elements(p_items) AS item
            GROUP BY COALESCE((item->>'product_id')::UUID, (item->>'productId')::UUID)
        ) n
        FULL OUTER JOIN (
            SELECT 
                product_id,
                SUM(qty)::INT AS old_qty
            FROM public.purchase_items
            WHERE purchase_id = p_purchase_id
            GROUP BY product_id
        ) o ON n.product_id = o.product_id
    ) LOOP
        -- Kunci baris produk master untuk mencegah race conditions
        SELECT name, stock INTO v_prod_name, v_current_stock
        FROM public.products
        WHERE id = v_rec.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produk dengan ID % tidak ditemukan di master produk.', v_rec.product_id;
        END IF;

        -- Validasi stok tidak boleh minus setelah dikurangi
        IF (v_current_stock + v_rec.delta_qty) < 0 THEN
            RAISE EXCEPTION 'Stok produk "%" tidak mencukupi untuk dikurangi. Stok saat ini: %, dibutuhkan pengurangan: %. Sebagian barang sudah terjual.',
                COALESCE(v_prod_name, v_rec.product_id::text),
                v_current_stock,
                abs(v_rec.delta_qty);
        END IF;

        -- Perbarui stok master produk dan harga beli terbaru
        IF v_rec.new_buy_price IS NOT NULL AND v_rec.new_qty > 0 THEN
            UPDATE public.products
            SET 
                stock = stock + v_rec.delta_qty,
                buy_price = v_rec.new_buy_price
            WHERE id = v_rec.product_id;
        ELSE
            UPDATE public.products
            SET 
                stock = stock + v_rec.delta_qty
            WHERE id = v_rec.product_id;
        END IF;
    END LOOP;

    -- f. Perbarui purchase_items: hapus item lama, masukkan item baru
    DELETE FROM public.purchase_items WHERE purchase_id = p_purchase_id;

    INSERT INTO public.purchase_items (purchase_id, product_id, qty, buy_price)
    SELECT 
        p_purchase_id,
        COALESCE((item->>'product_id')::UUID, (item->>'productId')::UUID),
        COALESCE((item->>'qty')::INT, 0),
        COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)
    FROM jsonb_array_elements(p_items) AS item;

    -- g. Hitung ulang total faktur pembelian
    SELECT COALESCE(SUM(
        COALESCE((item->>'qty')::INT, 0) * COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)
    ), 0)
    INTO v_total_amount
    FROM jsonb_array_elements(p_items) AS item;

    -- h. Perbarui header purchases
    UPDATE public.purchases
    SET 
        invoice_number = p_invoice_number,
        purchase_date = p_purchase_date,
        total_amount = v_total_amount
    WHERE id = p_purchase_id;

    -- Ambil snapshot data baru
    SELECT * INTO v_new_purchase
    FROM public.purchases
    WHERE id = p_purchase_id;

    SELECT jsonb_build_object(
        'purchase', to_jsonb(v_new_purchase),
        'items', COALESCE((
            SELECT jsonb_agg(to_jsonb(pi))
            FROM public.purchase_items pi
            WHERE pi.purchase_id = p_purchase_id
        ), '[]'::jsonb)
    ) INTO v_new_data;

    -- i. Dapatkan nama pengguna jika belum disediakan
    IF v_actual_user_name IS NULL AND v_actual_user_id IS NOT NULL THEN
        SELECT COALESCE(nama, email, 'Pengelola') INTO v_actual_user_name
        FROM public.pengelola
        WHERE id = v_actual_user_id;
    END IF;

    -- Validasi foreign key auth.users untuk v_actual_user_id agar tidak melanggar constraint jika ID tidak terdaftar di auth.users
    IF v_actual_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actual_user_id) THEN
            v_actual_user_id := NULL;
        END IF;
    END IF;

    -- j. Catat audit log perubahan
    INSERT INTO public.audit_logs (
        entity_name,
        entity_id,
        action,
        old_data,
        new_data,
        performed_by,
        performer_name,
        notes,
        created_at
    ) VALUES (
        'purchases',
        p_purchase_id,
        'UPDATE_PURCHASE',
        v_old_data,
        v_new_data,
        v_actual_user_id,
        v_actual_user_name,
        p_change_reason,
        TIMEZONE('utc'::text, NOW())
    ) RETURNING id INTO v_audit_id;

    -- k. Kembalikan respons JSON
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', p_purchase_id,
        'invoice_number', p_invoice_number,
        'total_amount', v_total_amount,
        'audit_log_id', v_audit_id,
        'updated_at', TIMEZONE('utc'::text, NOW())
    );
END;
$$;

-- Berikan hak eksekusi kepada role yang relevan
GRANT EXECUTE ON FUNCTION public.update_purchase_invoice_atomic(UUID, TEXT, DATE, JSONB, TEXT, UUID, TEXT) TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.audit_logs TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.purchases TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.purchase_items TO authenticated, anon, service_role;
