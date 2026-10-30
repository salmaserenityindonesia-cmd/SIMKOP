# Summary Plan 32.1: Wave 1 - Skema Database Retur Pembelian & Atomic Restock Claim RPC

## Objective
Membangun fondasi database PostgreSQL/Supabase untuk modul Retur Pembelian ke Supplier dengan menyediakan tabel `suppliers` (jika belum ada), tabel master `purchase_returns`, tabel rincian `purchase_return_items`, indeks pencarian, aturan keamanan Row Level Security (RLS), serta stored procedure / RPC atomik `complete_return_claim` untuk penyelesaian klaim barang pengganti sekaligus merestock kuantitas ke inventori master `products` dan mencatat jejak audit ke `audit_logs`.

## Tasks Completed
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Create Purchase Return Tables & Complete Claim RPC Migration (`supabase/migrations/026_create_purchase_returns_tables.sql`) | Completed | `719d579a` |

## Key Changes
1. **Tabel Master `public.purchase_returns`**:
   - Kolom: `id`, `return_number`, `return_date`, `supplier_id`, `supplier_name`, `original_invoice_number`, `return_type` (`BARANG_RUSAK` / `PIUTANG_PENGGANTIAN`), `claim_status` (`MENUNGGU_PENGGANTIAN` / `SELESAI_DIGANTI` / `HAPUS_BUKU`), `total_amount`, `replacement_received_at`, `notes`, `created_by`, `created_at`, `updated_at`.
2. **Tabel Detail `public.purchase_return_items`**:
   - Kolom: `id`, `return_id`, `product_id`, `qty`, `cost_per_unit`, `subtotal`, `reason`, `created_at`.
3. **Tabel Referensi `public.suppliers`**:
   - Kolom: `id`, `name`, `phone`, `address`, `created_at`.
4. **Indeks & RLS**:
   - Indeks pada `return_number`, `supplier_id`, `return_date DESC`, `claim_status`, `return_id`, `product_id`, dan `suppliers(name)`.
   - Kebijakan RLS terpusat untuk authenticated/admin/operator role pada ketiga tabel.
5. **RPC Atomik `public.complete_return_claim`**:
   - Menerima `p_return_id UUID`, `p_user_id UUID DEFAULT NULL`, `p_notes TEXT DEFAULT NULL`.
   - Mengunci record retur dengan `FOR UPDATE`, memvalidasi tipe retur `PIUTANG_PENGGANTIAN` dan status klaim `MENUNGGU_PENGGANTIAN`.
   - Merestock setiap item ke `products.stock` secara atomik dengan locking baris produk.
   - Memperbarui header klaim menjadi `SELESAI_DIGANTI` dan `replacement_received_at = NOW()`.
   - Mencatat rekonsiliasi audit trail ke `public.audit_logs`.

## Verification
- File exists: `powershell -Command "Test-Path 'supabase/migrations/026_create_purchase_returns_tables.sql'"` returned `True`.
- Git commit verified: `719d579a feat(phase-32): create purchase return tables and complete claim rpc migration`.

## Deferred
- None.
