-- Migration: 027_create_inventory_mutation_view.sql
-- Description: Unified Inventory Mutation View (v_inventory_mutations)
--              Menyatukan seluruh riwayat arus barang masuk dan keluar di gudang SIMKOP secara kronologis:
--              1. Barang Keluar: Penjualan Kasir POS (sales & sale_items)
--              2. Barang Masuk: Restock Faktur Pembelian Supplier (purchases & purchase_items)
--              3. Barang Keluar: Pengeluaran Retur ke Supplier (purchase_returns & purchase_return_items)
--              4. Barang Masuk: Penerimaan Fisik Barang Pengganti Retur Klaim Supplier (purchase_returns & purchase_return_items)
-- Phase: 34

CREATE OR REPLACE VIEW public.v_inventory_mutations AS
-- 1. Barang Keluar: Penjualan Kasir POS
SELECT 
    si.id::TEXT AS mutation_id,
    COALESCE(si.created_at, s.created_at) AS mutation_date,
    si.product_id AS product_id,
    'KELUAR_PENJUALAN'::TEXT AS mutation_type,
    'Penjualan Kasir'::TEXT AS type_label,
    s.sale_number::TEXT AS reference_number,
    0::INTEGER AS qty_in,
    si.qty::INTEGER AS qty_out,
    si.price::NUMERIC AS unit_price,
    COALESCE('Penjualan Kasir - ' || s.sale_number, 'Penjualan Kasir')::TEXT AS notes
FROM public.sale_items si
INNER JOIN public.sales s ON si.sale_id = s.id
WHERE COALESCE(s.sale_status, s.status, 'completed') = 'completed'

UNION ALL

-- 2. Barang Masuk: Restock Faktur Pembelian Supplier
SELECT 
    pi.id::TEXT AS mutation_id,
    COALESCE(p.purchase_date::TIMESTAMPTZ, p.created_at, pi.created_at) AS mutation_date,
    pi.product_id AS product_id,
    'MASUK_PEMBELIAN'::TEXT AS mutation_type,
    'Restock Pembelian'::TEXT AS type_label,
    COALESCE(p.invoice_number, '-')::TEXT AS reference_number,
    pi.qty::INTEGER AS qty_in,
    0::INTEGER AS qty_out,
    pi.buy_price::NUMERIC AS unit_price,
    COALESCE('Restock Pembelian - Faktur: ' || p.invoice_number, 'Restock Pembelian')::TEXT AS notes
FROM public.purchase_items pi
INNER JOIN public.purchases p ON pi.purchase_id = p.id

UNION ALL

-- 3. Barang Keluar: Pengeluaran Retur ke Supplier
SELECT 
    pri.id::TEXT AS mutation_id,
    COALESCE(pr.return_date::TIMESTAMPTZ, pr.created_at, pri.created_at) AS mutation_date,
    pri.product_id AS product_id,
    'KELUAR_RETUR'::TEXT AS mutation_type,
    'Retur ke Supplier'::TEXT AS type_label,
    COALESCE(pr.return_number, '-')::TEXT AS reference_number,
    0::INTEGER AS qty_in,
    pri.qty::INTEGER AS qty_out,
    pri.cost_per_unit::NUMERIC AS unit_price,
    ('Retur ke Supplier - ' || COALESCE(pr.return_number, '-') || COALESCE(' (' || pr.notes || ')', ''))::TEXT AS notes
FROM public.purchase_return_items pri
INNER JOIN public.purchase_returns pr ON pri.return_id = pr.id

UNION ALL

-- 4. Barang Masuk: Penerimaan Fisik Barang Pengganti Retur Klaim Supplier
SELECT 
    (pri.id::TEXT || '-claim')::TEXT AS mutation_id,
    pr.replacement_received_at AS mutation_date,
    pri.product_id AS product_id,
    'MASUK_KLAIM_PENGGANTI'::TEXT AS mutation_type,
    'Penerimaan Klaim Pengganti'::TEXT AS type_label,
    COALESCE(pr.return_number, '-')::TEXT AS reference_number,
    pri.qty::INTEGER AS qty_in,
    0::INTEGER AS qty_out,
    pri.cost_per_unit::NUMERIC AS unit_price,
    ('Penerimaan Fisik Pengganti Retur - ' || COALESCE(pr.return_number, '-'))::TEXT AS notes
FROM public.purchase_return_items pri
INNER JOIN public.purchase_returns pr ON pri.return_id = pr.id
WHERE pr.claim_status = 'SELESAI_DIGANTI' 
  AND pr.replacement_received_at IS NOT NULL;

-- Berikan komentar dokumentasi pada view
COMMENT ON VIEW public.v_inventory_mutations IS 'Unified Inventory Mutation View menyatukan riwayat barang masuk & keluar (penjualan kasir, pembelian restock, retur supplier, klaim pengganti).';

-- Konfigurasi hak akses (Grant Permissions)
GRANT SELECT ON public.v_inventory_mutations TO authenticated;
GRANT SELECT ON public.v_inventory_mutations TO anon;
GRANT SELECT ON public.v_inventory_mutations TO service_role;
