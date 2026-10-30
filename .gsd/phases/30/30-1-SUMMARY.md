# Phase 30 Plan 1 Summary: Wave 1 - Database Migration & Atomic Stock Adjustment RPC

## Objective
Membuat skema database PostgreSQL `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql` yang mendefinisikan tabel `public.audit_logs`, memastikan ketersediaan tabel `purchases` dan `purchase_items` beserta RLS policies, serta mengimplementasikan fungsi RPC atomik `public.update_purchase_invoice_atomic` untuk rekonsiliasi stok aman (mencegah stok minus) dan pencatatan audit trail lengkap.

## Changes
- **Tabel `public.audit_logs`**:
  - Kolom: `id`, `entity_name`, `entity_id`, `action`, `old_data`, `new_data`, `performed_by` (FK `auth.users(id)` ON DELETE SET NULL), `performer_name`, `notes`, `created_at`.
  - Indexes: `idx_audit_logs_entity`, `idx_audit_logs_created_at`.
  - Row Level Security: Mengizinkan admin, operator, dan authenticated user mengelola serta membaca log audit.
- **Tabel `public.purchases` & `public.purchase_items`**:
  - Memastikan kedua tabel terdefinisi dengan aman beserta foreign key cascade dan index pendukung (`invoice_number`, `purchase_date`, `purchase_id`, `product_id`).
  - Mengaktifkan RLS policies bagi peran pengelola.
- **Fungsi RPC `public.update_purchase_invoice_atomic`**:
  - Validasi ketat nomor faktur dan alasan perubahan (`p_change_reason` minimal 10 karakter).
  - Validasi array item (minimal 1 item, `qty > 0`, `buy_price >= 0`).
  - Row locking (`FOR UPDATE`) pada faktur pembelian dan baris produk master untuk mencegah race conditions.
  - Snapshot `old_data` dan `new_data` dalam format JSONB.
  - Perhitungan selisih stok (delta kuantitas = `new_qty - old_qty`) via outer join old vs new items.
  - Pencegahan stok minus: melemparkan exception informatif jika `(products.stock + delta) < 0` karena barang sudah terjual.
  - Pembaruan atomik `products.stock` dan `products.buy_price`.
  - Pembaruan baris `purchase_items` dan rekalkulasi `total_amount` pada `purchases`.
  - Penyisipan snapshot perubahan dan alasan koreksi ke `public.audit_logs`.
  - Hak eksekusi (`GRANT EXECUTE`) diberikan ke `authenticated`, `anon`, dan `service_role`.

## Verification
- **Static Review**: Struktur kolom SQL, RLS policies, constraint, dan logika PL/pgSQL dievaluasi secara menyeluruh.
- **Test Suite**: `npm run test` (11 test files, 71 tests passed).
- **TypeScript Typecheck**: `npm run typecheck` (0 error).

## Commits
- `f40fedf9`: `feat(phase-30): create audit logs table and atomic stock adjustment rpc`

## Success Criteria Status
- [x] Berkas migrasi `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql` terbuat secara valid.
- [x] Tabel `audit_logs` didefinisikan dengan RLS dan hak akses pengelola (admin & operator).
- [x] Fungsi RPC `update_purchase_invoice_atomic` menerapkan validasi panjang alasan (min 10 karakter), pencegahan stok minus (`stock + delta < 0`), serta pencatatan snapshot log ke `audit_logs`.
