---
phase: 32
plan: 1
wave: 1
gap_closure: false
---

# Plan 32.1: Wave 1 - Skema Database Retur Pembelian & Atomic Restock Claim RPC

## Objective
Membangun fondasi database PostgreSQL/Supabase untuk modul Retur Pembelian ke Supplier. Meliputi pembuatan tabel `suppliers` (jika belum ada), tabel master `purchase_returns`, tabel rincian `purchase_return_items`, indeks performa, aturan keamanan RLS, serta fungsi RPC atomik `complete_return_claim` untuk mengeksekusi penerimaan barang pengganti, memperbarui status klaim menjadi `SELESAI_DIGANTI`, merestock kuantitas ke inventori master `products`, dan mencatat mutasi audit trail ke `audit_logs`.

## Context
Load these files for context:
- supabase/migrations/023_purchase_audit_and_stock_adjustment.sql
- supabase/migrations/024_fix_audit_logs_table_name_constraint.sql
- supabase/migrations/025_safe_uuid_handling_purchase_update.sql

## Tasks

<task type="auto">
  <name>Create Purchase Return Tables & Complete Claim RPC Migration</name>
  <files>
    supabase/migrations/026_create_purchase_returns_tables.sql
  </files>
  <action>
    Buat file migrasi `supabase/migrations/026_create_purchase_returns_tables.sql`:
    1. Pastikan tabel `public.suppliers` tersedia:
       ```sql
       CREATE TABLE IF NOT EXISTS public.suppliers (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         name TEXT NOT NULL,
         phone TEXT,
         address TEXT,
         created_at TIMESTAMPTZ DEFAULT NOW()
       );
       ```
    2. Buat tabel master `public.purchase_returns`:
       ```sql
       CREATE TABLE IF NOT EXISTS public.purchase_returns (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         return_number TEXT NOT NULL UNIQUE,
         return_date DATE NOT NULL DEFAULT CURRENT_DATE,
         supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
         supplier_name TEXT,
         original_invoice_number TEXT,
         return_type TEXT NOT NULL CHECK (return_type IN ('BARANG_RUSAK', 'PIUTANG_PENGGANTIAN')),
         claim_status TEXT NOT NULL DEFAULT 'MENUNGGU_PENGGANTIAN' CHECK (claim_status IN ('MENUNGGU_PENGGANTIAN', 'SELESAI_DIGANTI', 'HAPUS_BUKU')),
         total_amount NUMERIC NOT NULL DEFAULT 0.00,
         replacement_received_at TIMESTAMPTZ,
         notes TEXT,
         created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );
       ```
    3. Buat tabel detail `public.purchase_return_items`:
       ```sql
       CREATE TABLE IF NOT EXISTS public.purchase_return_items (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
         product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
         qty INTEGER NOT NULL CHECK (qty > 0),
         cost_per_unit NUMERIC NOT NULL DEFAULT 0.00,
         subtotal NUMERIC NOT NULL DEFAULT 0.00,
         reason TEXT,
         created_at TIMESTAMPTZ DEFAULT NOW()
       );
       ```
    4. Buat indeks untuk performa kueri:
       ```sql
       CREATE INDEX IF NOT EXISTS idx_purchase_returns_number ON public.purchase_returns(return_number);
       CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON public.purchase_returns(supplier_id);
       CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON public.purchase_returns(return_date DESC);
       CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON public.purchase_returns(claim_status);
       CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON public.purchase_return_items(return_id);
       CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product ON public.purchase_return_items(product_id);
       ```
    5. Konfigurasi RLS (Row Level Security):
       - Enable RLS pada `purchase_returns` dan `purchase_return_items`.
       - Berikan policy SELECT, INSERT, UPDATE untuk authenticated user / staf.
    6. Implementasikan fungsi RPC atomik `public.complete_return_claim`:
       - Parameter: `p_return_id UUID`, `p_user_id UUID`, `p_notes TEXT DEFAULT NULL`.
       - Validasi bahwa record retur dengan ID tersebut ada, `claim_status = 'MENUNGGU_PENGGANTIAN'`, dan `return_type = 'PIUTANG_PENGGANTIAN'`.
       - Loop seluruh item pada `purchase_return_items`:
         * Tambah stok produk: `UPDATE public.products SET stock = stock + item.qty, updated_at = NOW() WHERE id = item.product_id`.
       - Update status retur:
         * `claim_status = 'SELESAI_DIGANTI'`
         * `replacement_received_at = NOW()`
         * `updated_at = NOW()`
       - Insert catatan jejak audit ke tabel `public.audit_logs`:
         * `table_name = 'purchase_returns'`
         * `action = 'COMPLETE_CLAIM'`
         * `record_id = p_return_id::text`
         * `entity_id = p_return_id`
         * `entity_name = 'purchase_returns'`
         * `performed_by = p_user_id`
         * `notes = COALESCE(p_notes, 'Barang pengganti dari supplier telah diterima dan stok ditambahkan kembali ke inventori')`
       - Return JSON objek status `{ "success": true, "return_id": p_return_id, "completed_at": NOW() }`.
  </action>
  <verify>
    Test-Path "supabase/migrations/026_create_purchase_returns_tables.sql"
  </verify>
  <done>
    File migrasi database 026 terbuat dengan skema tabel suppliers, purchase_returns, purchase_return_items, RLS policy, indeks kueri, dan RPC atomik complete_return_claim.
  </done>
</task>

## Success Criteria
- [ ] Berkas `supabase/migrations/026_create_purchase_returns_tables.sql` terbuat dengan sintaks PostgreSQL valid.
- [ ] Tabel `purchase_returns` dan `purchase_return_items` mencakup seluruh atribut status klaim dan relasi foreign key.
- [ ] Fungsi RPC `complete_return_claim` menjamin penambahan kembali stok produk dan pencatatan audit log secara atomik.
- [ ] Kebijakan RLS dan indeks pencarian terdefinisi lengkap.
