-- Migration: 033_create_atomic_pos_checkout_rpc.sql
-- Description: Transaksi Atomic POS Checkout RPC (process_pos_checkout)
-- Membungkus seluruh mutasi penjualan kasir (sales, sale_items, products stock deduction,
-- deposit_transactions potongan simpanan belanja, dan cash_flow) dalam satu transaksi ACID.

-- 1. Pastikan kolom-kolom pendukung tersedia pada tabel sales dan sale_items
DO $$
BEGIN
    -- Pastikan kolom shift_id pada public.sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'shift_id') THEN
        ALTER TABLE public.sales ADD COLUMN shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;
    END IF;

    -- Pastikan kolom paid_amount pada public.sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'paid_amount') THEN
        ALTER TABLE public.sales ADD COLUMN paid_amount numeric DEFAULT 0;
    END IF;

    -- Pastikan kolom sale_status pada public.sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'sale_status') THEN
        ALTER TABLE public.sales ADD COLUMN sale_status text DEFAULT 'completed';
    END IF;

    -- Pastikan kolom quantity dan qty pada public.sale_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'quantity') THEN
        ALTER TABLE public.sale_items ADD COLUMN quantity integer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'qty') THEN
        ALTER TABLE public.sale_items ADD COLUMN qty integer;
    END IF;

    -- Pastikan kolom unit_price dan price pada public.sale_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'unit_price') THEN
        ALTER TABLE public.sale_items ADD COLUMN unit_price numeric;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'price') THEN
        ALTER TABLE public.sale_items ADD COLUMN price numeric;
    END IF;
END $$;

-- 2. Buat Fungsi RPC Atomic POS Checkout
CREATE OR REPLACE FUNCTION public.process_pos_checkout(
    p_sale_number TEXT,
    p_member_id UUID DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_shift_id TEXT DEFAULT NULL,
    p_subtotal NUMERIC DEFAULT 0,
    p_discount NUMERIC DEFAULT 0,
    p_total_amount NUMERIC DEFAULT 0,
    p_payment_scheme TEXT DEFAULT 'cash',
    p_paid_cash NUMERIC DEFAULT 0,
    p_paid_deposit NUMERIC DEFAULT 0,
    p_paid_credit NUMERIC DEFAULT 0,
    p_items JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
    v_now TIMESTAMPTZ := TIMEZONE('utc'::text, NOW());
    v_sale_id UUID;
    v_shift_uuid UUID := NULL;
    v_item JSONB;
    v_product_id UUID;
    v_product_name TEXT;
    v_qty INTEGER;
    v_unit_price NUMERIC;
    v_subtotal NUMERIC;
    v_product_stock INTEGER;
    v_non_cash NUMERIC;
    v_cash_portion NUMERIC;
    v_effective_paid_cash NUMERIC;
    v_deposit_account_id UUID;
    v_current_deposit_balance NUMERIC := 0;
    v_subtotal_is_generated TEXT;
BEGIN
    -- A. Validasi Kelengkapan dan Integritas Input
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Daftar item belanja kosong.';
    END IF;

    IF p_total_amount < 0 THEN
        RAISE EXCEPTION 'Total belanja tidak valid: %', p_total_amount;
    END IF;

    -- Validasi Kebijakan Kasir: Non-Anggota Hanya Boleh Tunai Murni
    IF p_member_id IS NULL AND (COALESCE(p_paid_deposit, 0) > 0 OR COALESCE(p_paid_credit, 0) > 0) THEN
        RAISE EXCEPTION 'Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.';
    END IF;

    -- Parsing Shift ID (jika valid format uuid)
    IF p_shift_id IS NOT NULL AND trim(p_shift_id) <> '' THEN
        BEGIN
            v_shift_uuid := p_shift_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_shift_uuid := NULL;
        END;
    END IF;

    -- B. Hitung Porsi Kas Efektif (mengakomodasi kembalian kasir)
    v_non_cash := COALESCE(p_paid_deposit, 0) + COALESCE(p_paid_credit, 0);
    v_cash_portion := GREATEST(0, p_total_amount - v_non_cash);
    v_effective_paid_cash := COALESCE(p_paid_cash, 0);

    IF p_payment_scheme = 'cash' OR (v_effective_paid_cash >= v_cash_portion AND v_cash_portion > 0) THEN
        v_effective_paid_cash := v_cash_portion;
    END IF;

    -- C. Validasi Ketersediaan Stok Fisik & Kunci Baris Produk (Concurrency Guard)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 1));

        -- Kunci baris master produk untuk mencegah race-condition antar kasir
        SELECT name, stock INTO v_product_name, v_product_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produk dengan ID "%" tidak ditemukan dalam katalog.', v_product_id;
        END IF;

        IF v_product_stock < v_qty THEN
            RAISE EXCEPTION 'Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).', v_product_name, v_product_stock, v_qty;
        END IF;
    END LOOP;

    -- D. Validasi & Verifikasi Saldo Simpanan Belanja (jika menggunakan deposit)
    IF COALESCE(p_paid_deposit, 0) > 0 THEN
        -- Cari rekening simpanan belanja milik anggota
        SELECT md.id INTO v_deposit_account_id
        FROM public.member_deposits md
        JOIN public.deposit_types dt ON dt.id = md.deposit_type_id
        WHERE md.member_id = p_member_id
          AND (dt.code = 'BELANJA' OR dt.code = 'SB' OR dt.name ILIKE '%belanja%')
          AND COALESCE(md.is_terminated, false) = false
        LIMIT 1;

        IF v_deposit_account_id IS NULL THEN
            RAISE EXCEPTION 'Anggota tidak memiliki rekening Simpanan Belanja aktif.';
        END IF;

        -- Hitung saldo berjalan secara real-time
        SELECT COALESCE(
            SUM(
                CASE 
                    WHEN transaction_type = 'deposit' THEN amount 
                    WHEN transaction_type = 'withdrawal' THEN -amount 
                    ELSE 0 
                END
            ), 0
        ) INTO v_current_deposit_balance
        FROM public.deposit_transactions
        WHERE member_deposit_id = v_deposit_account_id;

        IF v_current_deposit_balance < p_paid_deposit THEN
            RAISE EXCEPTION 'Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp %, Dibutuhkan: Rp %).', 
                to_char(v_current_deposit_balance, 'FM999,999,999'), 
                to_char(p_paid_deposit, 'FM999,999,999');
        END IF;
    END IF;

    -- E. Insert Header Penjualan (public.sales)
    INSERT INTO public.sales (
        sale_number,
        member_id,
        cashier_id,
        shift_id,
        subtotal,
        discount,
        total_amount,
        paid_amount,
        paid_cash,
        paid_deposit,
        paid_credit,
        payment_scheme,
        status,
        sale_status,
        created_at
    ) VALUES (
        p_sale_number,
        p_member_id,
        p_cashier_id,
        v_shift_uuid,
        COALESCE(p_subtotal, p_total_amount),
        COALESCE(p_discount, 0),
        p_total_amount,
        p_total_amount,
        v_effective_paid_cash,
        COALESCE(p_paid_deposit, 0),
        COALESCE(p_paid_credit, 0),
        p_payment_scheme,
        'completed',
        'completed',
        v_now
    ) RETURNING id INTO v_sale_id;

    -- Cek apakah kolom subtotal pada sale_items merupakan generated column
    SELECT COALESCE(is_generated, 'NEVER') INTO v_subtotal_is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'subtotal';

    -- F. Insert Rincian Item Belanja & Potong Stok Produk
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::integer, (v_item->>'qty')::integer, 1));
        v_unit_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
        v_subtotal := COALESCE((v_item->>'subtotal')::numeric, (v_qty * v_unit_price));
        v_product_name := COALESCE(v_item->>'product_name', 'Item');

        -- Simpan ke sale_items (mengisi kedua konvensi kolom: qty/quantity, price/unit_price)
        IF v_subtotal_is_generated = 'ALWAYS' THEN
            INSERT INTO public.sale_items (
                sale_id,
                product_id,
                product_name,
                qty,
                quantity,
                price,
                unit_price,
                created_at
            ) VALUES (
                v_sale_id,
                v_product_id,
                v_product_name,
                v_qty,
                v_qty,
                v_unit_price,
                v_unit_price,
                v_now
            );
        ELSE
            INSERT INTO public.sale_items (
                sale_id,
                product_id,
                product_name,
                qty,
                quantity,
                price,
                unit_price,
                subtotal,
                created_at
            ) VALUES (
                v_sale_id,
                v_product_id,
                v_product_name,
                v_qty,
                v_qty,
                v_unit_price,
                v_unit_price,
                v_subtotal,
                v_now
            );
        END IF;

        -- Kurangi stok master produk
        UPDATE public.products
        SET stock = stock - v_qty,
            updated_at = v_now
        WHERE id = v_product_id;
    END LOOP;

    -- G. Eksekusi Pemotongan Simpanan Belanja (jika p_paid_deposit > 0)
    IF COALESCE(p_paid_deposit, 0) > 0 AND v_deposit_account_id IS NOT NULL THEN
        INSERT INTO public.deposit_transactions (
            member_deposit_id,
            transaction_date,
            transaction_type,
            amount,
            description,
            reference_no,
            payment_method,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_deposit_account_id,
            CURRENT_DATE,
            'withdrawal',
            p_paid_deposit,
            'Belanja Toko di Kasir POS (' || p_sale_number || ')',
            p_sale_number,
            'potong_simpanan_belanja',
            'Transaksi penjualan POS ID: ' || v_sale_id::text,
            p_cashier_id,
            v_now
        );
    END IF;

    -- H. Catat Arus Kas Masuk (jika ada porsi tunai dan tabel cash_flow tersedia)
    IF v_effective_paid_cash > 0 THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_flow') THEN
            INSERT INTO public.cash_flow (
                direction,
                amount,
                category,
                reference_id,
                created_at
            ) VALUES (
                'in',
                v_effective_paid_cash,
                'penjualan_tunai',
                v_sale_id,
                v_now
            );
        END IF;
    END IF;

    -- I. Return Output Sukses
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_number', p_sale_number,
        'message', 'Transaksi kasir POS berhasil diproses secara atomik.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Berikan izin eksekusi RPC kepada authenticated, anon, dan service_role
GRANT EXECUTE ON FUNCTION public.process_pos_checkout(
    TEXT, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB
) TO authenticated, anon, service_role;

