# Summary Plan 34.1: Wave 1 - Skema Database PostgreSQL Unified Inventory Mutation View

## Objective
Membangun PostgreSQL View terpadu `public.v_inventory_mutations` yang menyatukan seluruh riwayat arus barang masuk dan keluar di gudang SIMKOP secara kronologis via query `UNION ALL` sesuai skema tabel riil:
1. Barang Keluar: Penjualan Kasir POS (`sales` & `sale_items`)
2. Barang Masuk: Restock Faktur Pembelian Supplier (`purchases` & `purchase_items`)
3. Barang Keluar: Pengeluaran Retur ke Supplier (`purchase_returns` & `purchase_return_items`)
4. Barang Masuk: Penerimaan Fisik Barang Pengganti Retur Klaim Supplier (`purchase_returns` status 'SELESAI_DIGANTI' & `purchase_return_items`)

File migrasi menggunakan nomor urut 027 (`027_create_inventory_mutation_view.sql`).

## Tasks Completed
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Create Migration 027: Unified Inventory Mutation View (`supabase/migrations/027_create_inventory_mutation_view.sql`) | Completed | `1883e9a4` |

## Key Changes
1. **File Migrasi `supabase/migrations/027_create_inventory_mutation_view.sql`**:
   - Dibuat view `public.v_inventory_mutations` dengan kolom standar:
     * `mutation_id` (TEXT)
     * `mutation_date` (TIMESTAMPTZ)
     * `product_id` (UUID)
     * `mutation_type` (TEXT)
     * `type_label` (TEXT)
     * `reference_number` (TEXT)
     * `qty_in` (INTEGER)
     * `qty_out` (INTEGER)
     * `unit_price` (NUMERIC)
     * `notes` (TEXT)
   - Mengikuti resolusi kolom tabel riil:
     * Pada `sale_items`: menggunakan `si.qty AS qty_out` dan `si.price AS unit_price`.
     * Pada `sales`: filter status selesai menggunakan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
     * Pada `purchase_items`: menggunakan `pi.qty AS qty_in` dan `pi.buy_price AS unit_price`.
     * Pada `purchase_returns`: memisahkan arus keluar retur (`pri.qty AS qty_out`) dan penerimaan fisik barang pengganti klaim retur (`pri.qty AS qty_in`) yang berstatus `claim_status = 'SELESAI_DIGANTI'` dan `replacement_received_at IS NOT NULL`.
   - Diberikan hak akses:
     * `GRANT SELECT ON public.v_inventory_mutations TO authenticated;`
     * `GRANT SELECT ON public.v_inventory_mutations TO anon;`
     * `GRANT SELECT ON public.v_inventory_mutations TO service_role;`

## Verification
- File exists: `Test-Path supabase/migrations/027_create_inventory_mutation_view.sql` returned `True`.
- Git commit verified: `1883e9a4 feat(phase-34): create unified inventory mutation view migration 027`.

## Deferred
- None.
