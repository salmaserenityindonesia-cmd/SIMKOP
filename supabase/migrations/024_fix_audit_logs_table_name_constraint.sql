-- Migration: 024_fix_audit_logs_table_name_constraint.sql
-- Description: Memperbaiki not-null constraint violation pada kolom table_name di audit_logs.
--              Memastikan kolom table_name dan record_id memiliki default fallback dan terisi
--              secara eksplisit pada RPC update_purchase_invoice_atomic saat pengeditan faktur pembelian.

-- 1. Pastikan seluruh kolom yang dibutuhkan tersedia pada public.audit_logs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT DEFAULT 'purchases';
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action TEXT DEFAULT 'UPDATE';
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_name TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data JSONB;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data JSONB;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performed_by UUID;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performer_name TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

        -- Tetapkan default 'purchases' dan 'UPDATE' untuk mencegah null value violation
        ALTER TABLE public.audit_logs ALTER COLUMN table_name SET DEFAULT 'purchases';
        ALTER TABLE public.audit_logs ALTER COLUMN action SET DEFAULT 'UPDATE';
    ELSE
        CREATE TABLE IF NOT EXISTS public.audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            table_name TEXT NOT NULL DEFAULT 'purchases',
            action TEXT NOT NULL DEFAULT 'UPDATE',
            record_id TEXT,
            entity_name TEXT,
            entity_id UUID,
            old_data JSONB,
            new_data JSONB,
            performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            performer_name TEXT,
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
        );
    END IF;
END $$;

-- Indexing untuk pencarian cepat riwayat audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- 2. Perbarui Fungsi RPC: update_purchase_invoice_atomic
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

    -- e. Rekonsiliasi delta stok produk: delta = (new_qty - old_qty)
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
        SELECT COALESCE(nama, 'Pengelola') INTO v_actual_user_name
        FROM public.pengelola
        WHERE id = v_actual_user_id;
    END IF;

    -- Validasi foreign key auth.users untuk v_actual_user_id agar tidak melanggar constraint jika ID tidak terdaftar di auth.users
    IF v_actual_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actual_user_id) THEN
            v_actual_user_id := NULL;
        END IF;
    END IF;

    -- j. Catat audit log perubahan (MEMASTIKAN table_name DAN record_id TERISI EKSPLISIT)
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
        'purchases',
        'UPDATE_PURCHASE',
        p_purchase_id::text,
        'purchases',
        p_purchase_id,
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
