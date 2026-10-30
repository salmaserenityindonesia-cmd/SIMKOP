---
phase: 34
plan: 1
wave: 1
gap_closure: false
---

# Plan 34.1: Wave 1 - Skema Database PostgreSQL Unified Inventory Mutation View

## Objective
Membangun PostgreSQL View terpadu `public.v_inventory_mutations` yang menyatukan seluruh riwayat arus barang masuk dan keluar di gudang SIMKOP secara kronologis via query `UNION ALL` sesuai skema tabel riil:
1. Barang Keluar: Penjualan Kasir POS (`sales` & `sale_items`)
2. Barang Masuk: Restock Faktur Pembelian Supplier (`purchases` & `purchase_items`)
3. Barang Keluar: Pengeluaran Retur ke Supplier (`purchase_returns` & `purchase_return_items`)
4. Barang Masuk: Penerimaan Fisik Barang Pengganti Retur Klaim Supplier (`purchase_returns` status 'SELESAI_DIGANTI' & `purchase_return_items`)

File migrasi diberi nomor urut 027 (`027_create_inventory_mutation_view.sql`) karena nomor 025 (`025_safe_uuid_handling_purchase_update.sql`) dan 026 (`026_create_purchase_returns_tables.sql`) telah digunakan.

## Context
Load these files for context:
- supabase/migrations/016_create_pos_sales_tables.sql
- supabase/migrations/021_link_sales_to_cashier_shifts.sql
- supabase/migrations/023_purchase_audit_and_stock_adjustment.sql
- supabase/migrations/026_create_purchase_returns_tables.sql

## Tasks

<task type="auto">
  <name>Create Migration 027: Unified Inventory Mutation View</name>
  <files>
    supabase/migrations/027_create_inventory_mutation_view.sql
  </files>
  <action>
    Buat file migrasi `supabase/migrations/027_create_inventory_mutation_view.sql`:
    1. Buat view `public.v_inventory_mutations` dengan spesifikasi kolom:
       - `mutation_id TEXT`: ID unik mutasi (misal `si.id::text`, `pi.id::text`, `pri.id::text`, `pri.id::text || '-claim'`)
       - `mutation_date TIMESTAMPTZ`: Timestamp mutasi
       - `product_id UUID`: ID produk
       - `mutation_type TEXT`: Tipe mutasi kode internal ('KELUAR_PENJUALAN', 'MASUK_PEMBELIAN', 'KELUAR_RETUR', 'MASUK_KLAIM_PENGGANTI')
       - `type_label TEXT`: Label ramah pengguna ('Penjualan Kasir', 'Restock Pembelian', 'Retur ke Supplier', 'Penerimaan Klaim Pengganti')
       - `reference_number TEXT`: Nomor faktur / nota / retur
       - `qty_in INTEGER`: Jumlah kuantitas masuk (0 jika keluar)
       - `qty_out INTEGER`: Jumlah kuantitas keluar (0 jika masuk)
       - `unit_price NUMERIC`: Harga satuan (harga beli untuk restock/retur/klaim, harga jual untuk POS)
       - `notes TEXT`: Deskripsi atau catatan mutasi
    2. Sesuaikan nama kolom tabel riil:
       - Pada `sale_items`: gunakan `si.qty AS qty_out` dan `si.price AS unit_price` (jangan gunakan `quantity` atau `unit_price` yang tidak ada pada skema).
       - Pada `sales`: filter status dengan `COALESCE(s.sale_status, s.status, 'completed') = 'completed'`.
       - Pada `purchase_items`: gunakan `pi.qty AS qty_in` dan `pi.buy_price AS unit_price`.
       - Pada `purchase_returns` dan `purchase_return_items`: gunakan `pri.qty`, `pri.cost_per_unit AS unit_price`, dan filter klaim pengganti `pr.claim_status = 'SELESAI_DIGANTI' AND pr.replacement_received_at IS NOT NULL`.
    3. Konfigurasi hak akses (Grant Permissions):
       - `GRANT SELECT ON public.v_inventory_mutations TO authenticated;`
       - `GRANT SELECT ON public.v_inventory_mutations TO anon;`
  </action>
  <verify>
    Test-Path supabase/migrations/027_create_inventory_mutation_view.sql
  </verify>
  <done>
    File migrasi 027 terbuat dengan skema SQL UNION ALL yang presisi, valid terhadap kolom tabel riil, dan memiliki hak akses yang memadai.
  </done>
</task>

## Success Criteria
- [ ] File migrasi `027_create_inventory_mutation_view.sql` terdefinisi lengkap
- [ ] View `public.v_inventory_mutations` memuat 4 sumber mutasi (penjualan, pembelian, retur, klaim pengganti)
- [ ] Tidak ada referensi ke kolom yang salah pada `sale_items` (menggunakan `qty` dan `price`)
- [ ] Hak akses SELECT diberikan kepada role authenticated dan anon

