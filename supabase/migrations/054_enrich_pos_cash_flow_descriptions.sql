-- Migration: 054_enrich_pos_cash_flow_descriptions.sql
-- Description: Memastikan kolom description tersedia pada public.cash_flow,
--              memperbarui RPC process_pos_checkout agar mencatat deskripsi baku
--              "Penjualan Tunai (<sale_number>) — <nrp - nama | Pelanggan Umum> (Rp <nominal>)"
--              ke public.cash_flow, dan melakukan backfill baris penjualan POS lama
--              yang deskripsinya masih kosong, '-', atau memakai istilah "Pembelian Tunai".

-- 1. Pastikan kolom description tersedia pada public.cash_flow
ALTER TABLE public.cash_flow
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Perbarui Fungsi RPC Atomic POS Checkout agar menyertakan description informatif
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
    v_cashier_uuid UUID := NULL;
    v_created_by_uuid UUID := NULL;
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
    v_member_nrp TEXT;
    v_member_nama TEXT;
    v_buyer_info TEXT := 'Pelanggan Umum';
    v_formatted_cash TEXT;
    v_cf_description TEXT;
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

    -- Parsing & validasi aman Shift ID (cegah FK error jika shift hanya ada di local fallback)
    IF p_shift_id IS NOT NULL AND trim(p_shift_id) <> '' THEN
        BEGIN
            v_shift_uuid := p_shift_id::uuid;
            IF NOT EXISTS (SELECT 1 FROM public.cashier_shifts WHERE id = v_shift_uuid) THEN
                v_shift_uuid := NULL;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_shift_uuid := NULL;
        END;
    END IF;

    -- Validasi aman Cashier ID terhadap public.pengelola(id)
    IF p_cashier_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.pengelola WHERE id = p_cashier_id) THEN
            v_cashier_uuid := p_cashier_id;
        END IF;
    END IF;

    -- Validasi aman created_by terhadap auth.users(id)
    v_created_by_uuid := COALESCE(p_cashier_id, auth.uid());
    IF v_created_by_uuid IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_created_by_uuid) THEN
            v_created_by_uuid := NULL;
        END IF;
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

    -- E. Insert Header Penjualan (public.sales) dengan cast enum resmi
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
        sale_status,
        created_at
    ) VALUES (
        p_sale_number,
        p_member_id,
        v_cashier_uuid,
        v_shift_uuid,
        COALESCE(p_subtotal, p_total_amount),
        COALESCE(p_discount, 0),
        p_total_amount,
        p_total_amount,
        v_effective_paid_cash,
        COALESCE(p_paid_deposit, 0),
        COALESCE(p_paid_credit, 0),
        (CASE
            WHEN p_payment_scheme IN ('cash', 'split', 'store_credit') THEN p_payment_scheme
            ELSE 'cash'
         END)::public.payment_scheme,
        'completed'::public.sale_status,
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
            v_created_by_uuid,
            v_now
        );
    END IF;

    -- H. Catat Arus Kas Masuk dengan deskripsi lengkap (jika ada porsi tunai dan tabel cash_flow tersedia)
    IF v_effective_paid_cash > 0 THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_flow') THEN
            BEGIN
                IF p_member_id IS NOT NULL THEN
                    SELECT NULLIF(TRIM(nrp), ''), NULLIF(TRIM(nama), '')
                    INTO v_member_nrp, v_member_nama
                    FROM public.anggota
                    WHERE id = p_member_id;

                    IF v_member_nrp IS NOT NULL AND v_member_nrp <> '-' AND v_member_nama IS NOT NULL AND v_member_nama <> '-' THEN
                        v_buyer_info := v_member_nrp || ' - ' || v_member_nama;
                    ELSIF v_member_nama IS NOT NULL AND v_member_nama <> '-' THEN
                        v_buyer_info := v_member_nama;
                    ELSIF v_member_nrp IS NOT NULL AND v_member_nrp <> '-' THEN
                        v_buyer_info := v_member_nrp;
                    ELSE
                        v_buyer_info := 'Pelanggan Umum';
                    END IF;
                END IF;

                v_formatted_cash := REPLACE(TRIM(TO_CHAR(ROUND(v_effective_paid_cash), 'FM999,999,999,990')), ',', '.');
                v_cf_description := 'Penjualan Tunai (' || p_sale_number || ') — ' || v_buyer_info || ' (Rp ' || v_formatted_cash || ')';

                INSERT INTO public.cash_flow (
                    direction,
                    amount,
                    category,
                    reference_id,
                    description,
                    created_at
                ) VALUES (
                    'in',
                    v_effective_paid_cash,
                    'penjualan_tunai',
                    v_sale_id,
                    v_cf_description,
                    v_now
                );
            EXCEPTION
                WHEN OTHERS THEN
                    NULL;
            END;
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

-- 3. Backfill idempoten untuk baris cash_flow penjualan POS lama yang deskripsinya masih kosong, '-', atau memakai istilah "Pembelian Tunai"
UPDATE public.cash_flow cf
SET description = (
    'Penjualan Tunai (' || COALESCE(NULLIF(TRIM(s.sale_number), ''), 'POS-' || UPPER(LEFT(s.id::TEXT, 8))) || ') — ' ||
    CASE
        WHEN NULLIF(TRIM(m.nrp), '') IS NOT NULL AND TRIM(m.nrp) <> '-' AND NULLIF(TRIM(m.nama), '') IS NOT NULL AND TRIM(m.nama) <> '-'
            THEN TRIM(m.nrp) || ' - ' || TRIM(m.nama)
        WHEN NULLIF(TRIM(m.nama), '') IS NOT NULL AND TRIM(m.nama) <> '-'
            THEN TRIM(m.nama)
        WHEN NULLIF(TRIM(m.nrp), '') IS NOT NULL AND TRIM(m.nrp) <> '-'
            THEN TRIM(m.nrp)
        ELSE 'Pelanggan Umum'
    END ||
    ' (Rp ' || REPLACE(TRIM(TO_CHAR(ROUND(COALESCE(cf.amount, s.paid_cash, s.total_amount, 0)), 'FM999,999,999,990')), ',', '.') || ')'
)
FROM public.sales s
LEFT JOIN public.anggota m ON m.id = s.member_id
WHERE cf.reference_id = s.id
  AND UPPER(REPLACE(TRIM(COALESCE(cf.category, '')), ' ', '_')) IN ('PENJUALAN_TUNAI', 'PENJUALAN_POS')
  AND (
      cf.description IS NULL
      OR TRIM(cf.description) IN ('', '-')
      OR LOWER(TRIM(cf.description)) = 'penjualan kasir tunai'
      OR LOWER(cf.description) LIKE '%pembelian tunai%'
      OR LOWER(cf.description) LIKE '%pembelian_tunai%'
  );

GRANT EXECUTE ON FUNCTION public.process_pos_checkout(
    TEXT, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
