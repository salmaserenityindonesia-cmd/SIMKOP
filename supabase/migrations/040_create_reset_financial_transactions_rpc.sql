-- Migration: 040_create_reset_financial_transactions_rpc.sql
-- Description: Fungsi PostgreSQL RPC atomik untuk mereset seluruh transaksi keuangan kas (cash flow),
--              penjualan kasir retail POS (sales, sale_items, cashier_shifts),
--              serta mengembalikan hak simpanan anggota dengan membatalkan/menghapus riwayat penarikan
--              dan pencairan simpanan, tanpa merusak master data anggota maupun stok inventori produk.

CREATE OR REPLACE FUNCTION public.reset_financial_transactions(p_admin_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_user_id UUID := NULL;
    v_sales_count INTEGER := 0;
    v_withdrawals_count INTEGER := 0;
    v_cash_flow_count INTEGER := 0;
    v_shifts_count INTEGER := 0;
BEGIN
    -- 1. Validasi foreign key p_admin_id ke auth.users, jika tidak valid gunakan auth.uid() atau NULL
    IF p_admin_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = p_admin_id) THEN
        v_admin_user_id := p_admin_id;
    ELSIF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()) THEN
        v_admin_user_id := auth.uid();
    ELSE
        v_admin_user_id := NULL;
    END IF;

    -- 2. Bersihkan transaksi pembayaran cicilan toko / store credit
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_credit_payments') THEN
        DELETE FROM public.store_credit_payments WHERE id IS NOT NULL;
    END IF;

    -- 3. Bersihkan rincian penjualan POS kasir retail
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
        DELETE FROM public.sale_items WHERE id IS NOT NULL;
    END IF;

    -- 4. Hitung dan bersihkan transaksi penjualan utama POS kasir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        SELECT COUNT(*) INTO v_sales_count FROM public.sales;
        DELETE FROM public.sales WHERE id IS NOT NULL;
    END IF;

    -- 5. Bersihkan transaksi POS kasir legacy (transaksi_item & transaksi) jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaksi_item') THEN
        EXECUTE 'DELETE FROM public.transaksi_item WHERE id IS NOT NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaksi') THEN
        EXECUTE 'DELETE FROM public.transaksi WHERE id IS NOT NULL';
    END IF;

    -- 6. Bersihkan riwayat sesi shift kasir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cashier_shifts') THEN
        SELECT COUNT(*) INTO v_shifts_count FROM public.cashier_shifts;
        DELETE FROM public.cashier_shifts WHERE id IS NOT NULL;
    END IF;

    -- 7. Bersihkan siklus pencairan THR Lebaran jika tabel ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lebaran_disbursement_cycles') THEN
        DELETE FROM public.lebaran_disbursement_cycles WHERE id IS NOT NULL;
    END IF;

    -- 8. Kembalikan hak simpanan anggota dengan menghapus riwayat penarikan, pencairan, dan potongan belanja
    --    (Menjaga setoran/simpanan pokok/wajib/sukarela masuk tetap utuh)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deposit_transactions') THEN
        SELECT COUNT(*) INTO v_withdrawals_count 
        FROM public.deposit_transactions 
        WHERE transaction_type IN ('withdrawal', 'termination')
           OR description ILIKE '%penarikan%'
           OR description ILIKE '%pencairan%'
           OR description ILIKE '%belanja kasir%'
           OR payment_method = 'potong_simpanan_belanja';

        DELETE FROM public.deposit_transactions 
        WHERE transaction_type IN ('withdrawal', 'termination')
           OR description ILIKE '%penarikan%'
           OR description ILIKE '%pencairan%'
           OR description ILIKE '%belanja kasir%'
           OR payment_method = 'potong_simpanan_belanja';
    END IF;

    -- 9. Bersihkan seluruh riwayat arus kas utama (cash_flow)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_flow') THEN
        SELECT COUNT(*) INTO v_cash_flow_count FROM public.cash_flow;
        DELETE FROM public.cash_flow WHERE id IS NOT NULL;
    END IF;

    -- 10. Catat aktivitas reset ke tabel public.audit_logs jika tabel tersedia
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
            notes,
            created_at
        ) VALUES (
            'financial_transactions',
            'RESET_ALL',
            'SYSTEM_WIDE',
            'financial_transactions',
            NULL,
            NULL,
            jsonb_build_object(
                'deleted_sales', v_sales_count,
                'deleted_shifts', v_shifts_count,
                'deleted_withdrawals', v_withdrawals_count,
                'deleted_cash_flows', v_cash_flow_count
            ),
            v_admin_user_id,
            'Admin melakukan reset seluruh transaksi kas keuangan, penjualan kasir retail POS, dan penarikan simpanan anggota.',
            TIMEZONE('utc'::text, NOW())
        );
    END IF;

    -- 11. Kembalikan respons terstruktur JSONB
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Seluruh transaksi kas keuangan, penjualan kasir, dan penarikan simpanan berhasil direset.',
        'sales_deleted', v_sales_count,
        'withdrawals_deleted', v_withdrawals_count,
        'cash_flow_deleted', v_cash_flow_count,
        'shifts_deleted', v_shifts_count,
        'deleted_sales', v_sales_count,
        'deleted_withdrawals', v_withdrawals_count,
        'deleted_cash_flows', v_cash_flow_count
    );
END;
$$;

-- Berikan izin eksekusi kepada authenticated, anon, dan service_role
GRANT EXECUTE ON FUNCTION public.reset_financial_transactions(UUID) TO authenticated, anon, service_role;
