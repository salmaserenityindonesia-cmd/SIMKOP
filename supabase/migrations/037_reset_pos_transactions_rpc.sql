-- Migration: 037_reset_pos_transactions_rpc.sql
-- Description: Fungsi PostgreSQL RPC atomik untuk mengosongkan seluruh histori transaksi retail toko
--              (penjualan kasir, shift kasir, pembelian supplier, retur barang, pembayaran simpanan belanja POS)
--              tanpa mengubah stok master barang di tabel public.products.

CREATE OR REPLACE FUNCTION public.reset_pos_and_procurement_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_sales_count integer := 0;
    deleted_purchases_count integer := 0;
    deleted_returns_count integer := 0;
BEGIN
    -- 1. Bersihkan transaksi pembayaran cicilan toko / store credit
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_credit_payments') THEN
        DELETE FROM public.store_credit_payments WHERE id IS NOT NULL;
    END IF;

    -- 2. Bersihkan mutasi simpanan belanja kasir agar saldo anggota kembali utuh saat testing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deposit_transactions') THEN
        DELETE FROM public.deposit_transactions WHERE payment_method = 'potong_simpanan_belanja' AND id IS NOT NULL;
    END IF;

    -- 3. Bersihkan rincian item penjualan kasir dan penjualan utama
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
        DELETE FROM public.sale_items WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
        DELETE FROM public.sales WHERE id IS NOT NULL;
        GET DIAGNOSTICS deleted_sales_count = ROW_COUNT;
    END IF;

    -- 4. Bersihkan transaksi legacy jika tabel transaksi / transaksi_item digunakan
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaksi_item') THEN
        DELETE FROM public.transaksi_item WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaksi') THEN
        DELETE FROM public.transaksi WHERE id IS NOT NULL;
    END IF;

    -- 5. Bersihkan riwayat sesi shift kasir
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cashier_shifts') THEN
        DELETE FROM public.cashier_shifts WHERE id IS NOT NULL;
    END IF;

    -- 6. Bersihkan riwayat retur barang ke supplier
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_return_items') THEN
        DELETE FROM public.purchase_return_items WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_returns') THEN
        DELETE FROM public.purchase_returns WHERE id IS NOT NULL;
        GET DIAGNOSTICS deleted_returns_count = ROW_COUNT;
    END IF;

    -- 7. Bersihkan riwayat restock dan faktur pembelian supplier
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restock_items') THEN
        DELETE FROM public.restock_items WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restock_invoices') THEN
        DELETE FROM public.restock_invoices WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchase_items') THEN
        DELETE FROM public.purchase_items WHERE id IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'purchases') THEN
        DELETE FROM public.purchases WHERE id IS NOT NULL;
        GET DIAGNOSTICS deleted_purchases_count = ROW_COUNT;
    END IF;

    -- 8. Catat aksi reset ini ke tabel audit_logs jika ada
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        INSERT INTO public.audit_logs (
            table_name,
            action,
            record_id,
            performed_by,
            notes,
            created_at
        ) VALUES (
            'sales',
            'RESET_POS_HISTORY',
            'SYSTEM',
            auth.uid(),
            'Admin melakukan reset total histori transaksi kasir, pembelian, dan retur tanpa mengubah kuantitas master stok inventori.',
            now()
        );
    END IF;

    -- PERHATIAN: Tabel public.products sengaja TIDAK diubah, stok barang tetap utuh apa adanya.

    RETURN jsonb_build_object(
        'success', true,
        'deleted_sales', deleted_sales_count,
        'deleted_purchases', deleted_purchases_count,
        'deleted_returns', deleted_returns_count,
        'message', 'Seluruh riwayat penjualan, shift kasir, pembelian, dan retur barang berhasil dikosongkan. Stok barang tetap utuh.'
    );
END;
$$;

-- Berikan izin eksekusi kepada pengguna terautentikasi (admin), anon, dan service_role
GRANT EXECUTE ON FUNCTION public.reset_pos_and_procurement_history() TO authenticated, anon, service_role;

