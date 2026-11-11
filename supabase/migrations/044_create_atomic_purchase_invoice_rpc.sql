-- Migration: 044_create_atomic_purchase_invoice_rpc.sql
-- Description: Transaksi Atomic Restock Faktur Pembelian RPC (create_purchase_invoice_atomic)
-- Membungkus pembuatan faktur pembelian (purchases), rincian item (purchase_items),
-- penambahan stok dan harga beli master produk (products FOR UPDATE), serta audit trail dalam transaksi ACID.

-- 1. Buat Fungsi RPC Atomic Pembuatan Faktur Pembelian
CREATE OR REPLACE FUNCTION public.create_purchase_invoice_atomic(
    p_invoice_number TEXT,
    p_purchase_date DATE DEFAULT CURRENT_DATE,
    p_items JSONB DEFAULT '[]'::JSONB,
    p_user_id UUID DEFAULT NULL,
    p_user_name TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_clean_invoice TEXT;
    v_clean_date DATE;
    v_purchase_id UUID;
    v_item RECORD;
    v_product_id UUID;
    v_qty INTEGER;
    v_buy_price NUMERIC;
    v_prod_name TEXT;
    v_current_stock INTEGER;
    v_total_amount NUMERIC := 0;
    v_audit_table_exists BOOLEAN;
BEGIN
    -- 1. Validasi parameter nomor faktur
    v_clean_invoice := TRIM(COALESCE(p_invoice_number, ''));
    IF v_clean_invoice = '' THEN
        RAISE EXCEPTION 'Nomor faktur pembelian (invoice_number) harus diisi.';
    END IF;

    -- Validasi tanggal
    v_clean_date := COALESCE(p_purchase_date, CURRENT_DATE);

    -- 2. Validasi array item
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Faktur pembelian harus memiliki minimal satu item produk.';
    END IF;

    -- 3. Iterasi validasi awal & kunci baris produk untuk mencegah race conditions
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := COALESCE(
            NULLIF(v_item.value->>'product_id', '')::UUID,
            NULLIF(v_item.value->>'productId', '')::UUID,
            NULLIF(v_item.value->>'produkId', '')::UUID
        );

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Setiap item faktur harus memiliki ID produk yang valid.';
        END IF;

        v_qty := COALESCE((v_item.value->>'qty')::INT, (v_item.value->>'quantity')::INT, 0);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Kuantitas setiap item produk harus lebih besar dari 0.';
        END IF;

        v_buy_price := COALESCE((v_item.value->>'buy_price')::NUMERIC, (v_item.value->>'hargaBeli')::NUMERIC, (v_item.value->>'price')::NUMERIC, -1);
        IF v_buy_price < 0 THEN
            RAISE EXCEPTION 'Harga beli item produk tidak boleh negatif.';
        END IF;

        -- Kunci baris produk
        SELECT name, stock INTO v_prod_name, v_current_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produk dengan ID % tidak ditemukan di katalog produk.', v_product_id;
        END IF;

        -- Update stok produk dan harga beli master
        UPDATE public.products
        SET stock = stock + v_qty,
            buy_price = v_buy_price,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE id = v_product_id;

        -- Hitung total faktur
        v_total_amount := v_total_amount + (v_qty * v_buy_price);
    END LOOP;

    -- 4. Sisipkan record faktur induk ke purchases
    INSERT INTO public.purchases (
        invoice_number,
        purchase_date,
        total_amount,
        created_at
    ) VALUES (
        v_clean_invoice,
        v_clean_date,
        v_total_amount,
        TIMEZONE('utc'::text, NOW())
    ) RETURNING id INTO v_purchase_id;

    -- 5. Sisipkan rincian item ke purchase_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := COALESCE(
            NULLIF(v_item.value->>'product_id', '')::UUID,
            NULLIF(v_item.value->>'productId', '')::UUID,
            NULLIF(v_item.value->>'produkId', '')::UUID
        );
        v_qty := COALESCE((v_item.value->>'qty')::INT, (v_item.value->>'quantity')::INT, 0);
        v_buy_price := COALESCE((v_item.value->>'buy_price')::NUMERIC, (v_item.value->>'hargaBeli')::NUMERIC, (v_item.value->>'price')::NUMERIC, 0);

        INSERT INTO public.purchase_items (
            purchase_id,
            product_id,
            qty,
            buy_price,
            created_at
        ) VALUES (
            v_purchase_id,
            v_product_id,
            v_qty,
            v_buy_price,
            TIMEZONE('utc'::text, NOW())
        );
    END LOOP;

    -- 6. Catat audit log jika tabel audit_logs tersedia
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) INTO v_audit_table_exists;

    IF v_audit_table_exists THEN
        BEGIN
            INSERT INTO public.audit_logs (
                table_name,
                action,
                record_id,
                entity_name,
                entity_id,
                performed_by,
                performer_name,
                notes,
                new_data,
                created_at
            ) VALUES (
                'purchases',
                'INSERT',
                v_purchase_id::TEXT,
                'purchases',
                v_purchase_id,
                p_user_id,
                p_user_name,
                'Pencatatan faktur restock pembelian baru: ' || v_clean_invoice,
                jsonb_build_object(
                    'invoice_number', v_clean_invoice,
                    'purchase_date', v_clean_date,
                    'total_amount', v_total_amount,
                    'items_count', jsonb_array_length(p_items)
                ),
                TIMEZONE('utc'::text, NOW())
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Tidak membatalkan transaksi utama jika logging audit gagal
                NULL;
        END;
    END IF;

    -- 7. Kembalikan data lengkap hasil pembuatan faktur
    RETURN jsonb_build_object(
        'success', true,
        'id', v_purchase_id,
        'noFaktur', v_clean_invoice,
        'invoice_number', v_clean_invoice,
        'tanggal', v_clean_date,
        'purchase_date', v_clean_date,
        'totalNilai', v_total_amount,
        'total_amount', v_total_amount,
        'items', p_items
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hak Akses Eksekusi RPC
GRANT EXECUTE ON FUNCTION public.create_purchase_invoice_atomic(TEXT, DATE, JSONB, UUID, TEXT) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.create_purchase_invoice_atomic IS 'Mencatat faktur restock pembelian baru, menyisipkan rincian item, dan memperbarui stok master produk secara atomik dalam satu transaksi ACID';

