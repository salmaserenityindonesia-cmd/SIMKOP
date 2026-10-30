-- Migration: 025_safe_uuid_handling_purchase_update.sql
-- Description: Menghapus overload ganda yang memicu galat 'Could not choose the best candidate function'
--              dan menetapkan SATU fungsi kanonik update_purchase_invoice_atomic yang aman,
--              dengan p_user_id bertipe UUID (DEFAULT NULL), fallback pencarian faktur berdasarkan
--              id maupun invoice_number, serta penanganan product_id yang toleran terhadap SKU/numerik.

-- 1. Hapus overload fungsi dengan parameter TEXT yang menyebabkan konflik ambiguitas (error 42725)
DROP FUNCTION IF EXISTS public.update_purchase_invoice_atomic(UUID, TEXT, DATE, JSONB, TEXT, TEXT, TEXT);

-- 2. Buat atau perbarui SATU-SATUNYA fungsi kanonik dengan signature UUID
CREATE OR REPLACE FUNCTION public.update_purchase_invoice_atomic(
    p_purchase_id UUID,
    p_invoice_number TEXT,
    p_purchase_date DATE,
    p_items JSONB,
    p_change_reason TEXT,
    p_user_id UUID DEFAULT NULL,
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
    -- a. Validasi foreign key auth.users untuk v_actual_user_id agar tidak melanggar constraint jika ID tidak terdaftar di auth.users
    IF v_actual_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actual_user_id) THEN
            v_actual_user_id := NULL;
        END IF;
    END IF;

    -- b. Validasi nomor faktur
    IF p_invoice_number IS NULL OR trim(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Nomor faktur pembelian harus diisi.';
    END IF;

    -- c. Validasi alasan perubahan (minimal 10 karakter)
    IF p_change_reason IS NULL OR char_length(trim(p_change_reason)) < 10 THEN
        RAISE EXCEPTION 'Alasan perubahan faktur harus diisi minimal 10 karakter.';
    END IF;

    -- d. Validasi keberadaan array items
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

    -- e. Kunci dan ambil data faktur lama (coba berdasarkan id, atau fallback nomor faktur jika id tidak cocok)
    SELECT * INTO v_old_purchase
    FROM public.purchases
    WHERE id = p_purchase_id
    FOR UPDATE;

    IF NOT FOUND THEN
        SELECT * INTO v_old_purchase
        FROM public.purchases
        WHERE invoice_number = trim(p_invoice_number)
        FOR UPDATE;

        IF FOUND THEN
            p_purchase_id := v_old_purchase.id;
        END IF;
    END IF;

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

    -- f. Rekonsiliasi delta stok produk: delta = (new_qty - old_qty)
    FOR v_rec IN (
        SELECT 
            COALESCE(n.product_id, o.product_id) AS product_id,
            COALESCE(o.old_qty, 0) AS old_qty,
            COALESCE(n.new_qty, 0) AS new_qty,
            (COALESCE(n.new_qty, 0) - COALESCE(o.old_qty, 0)) AS delta_qty,
            n.new_buy_price
        FROM (
            SELECT 
                CASE 
                    WHEN (item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                        THEN (item->>'product_id')::UUID
                    WHEN (item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                        THEN (item->>'productId')::UUID
                    ELSE (
                        SELECT id FROM public.products 
                        WHERE sku = COALESCE(item->>'product_id', item->>'productId')
                        LIMIT 1
                    )
                END AS product_id,
                SUM(COALESCE((item->>'qty')::INT, 0))::INT AS new_qty,
                MAX(COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)) AS new_buy_price
            FROM jsonb_array_elements(p_items) AS item
            GROUP BY 1
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
        IF v_rec.product_id IS NULL THEN
            RAISE EXCEPTION 'Terdapat item produk dengan ID yang tidak valid atau tidak terdaftar di master produk.';
        END IF;

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

    -- g. Perbarui purchase_items: hapus item lama, masukkan item baru
    DELETE FROM public.purchase_items WHERE purchase_id = p_purchase_id;

    INSERT INTO public.purchase_items (purchase_id, product_id, qty, buy_price)
    SELECT 
        p_purchase_id,
        CASE 
            WHEN (item->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN (item->>'product_id')::UUID
            WHEN (item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN (item->>'productId')::UUID
            ELSE (
                SELECT id FROM public.products 
                WHERE sku = COALESCE(item->>'product_id', item->>'productId')
                LIMIT 1
            )
        END,
        COALESCE((item->>'qty')::INT, 0),
        COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)
    FROM jsonb_array_elements(p_items) AS item;

    -- h. Hitung ulang total faktur pembelian
    SELECT COALESCE(SUM(
        COALESCE((item->>'qty')::INT, 0) * COALESCE((item->>'buy_price')::NUMERIC, (item->>'hargaBeli')::NUMERIC, 0)
    ), 0)
    INTO v_total_amount
    FROM jsonb_array_elements(p_items) AS item;

    -- i. Perbarui header purchases
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

    -- j. Dapatkan nama pengguna jika belum disediakan
    IF v_actual_user_name IS NULL AND v_actual_user_id IS NOT NULL THEN
        SELECT COALESCE(nama, 'Pengelola') INTO v_actual_user_name
        FROM public.pengelola
        WHERE id = v_actual_user_id;
    END IF;

    -- k. Catat audit log perubahan (MEMASTIKAN table_name DAN record_id TERISI EKSPLISIT)
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

    -- l. Kembalikan respons JSON
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
