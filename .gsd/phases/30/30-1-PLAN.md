---
phase: 30
plan: 1
wave: 1
gap_closure: false
---

# Plan 30.1: Wave 1 - Database Migration & Atomic Stock Adjustment RPC

## Objective
Membuat skema database migrasi PostgreSQL `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql` yang mendefinisikan tabel `public.audit_logs` untuk mencatat rekam jejak perubahan sistem, serta fungsi RPC `public.update_purchase_invoice_atomic` untuk memperbarui faktur pembelian, menghitung selisih kuantitas item (delta stock), merekonsiliasi stok produk secara atomik dengan validasi agar tidak minus, dan mencatat log audit lengkap.

## Context
Load these files for context:
- supabase/migrations/007_add_salary_and_bank_account_to_anggota.sql
- supabase/migrations/015_create_cash_flow_and_withdrawal_rpc.sql
- src/services/koperasiService.ts

## Tasks

<task type="auto">
  <name>Create Audit Logs Table and Atomic Stock Adjustment RPC</name>
  <files>
    supabase/migrations/023_purchase_audit_and_stock_adjustment.sql
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql`:
       - Buat tabel `public.audit_logs`:
         * `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
         * `entity_name TEXT NOT NULL` (contoh: 'purchases')
         * `entity_id UUID NOT NULL`
         * `action TEXT NOT NULL` (contoh: 'UPDATE_PURCHASE')
         * `old_data JSONB`
         * `new_data JSONB`
         * `performed_by UUID REFERENCES auth.users(id)`
         * `performer_name TEXT`
         * `notes TEXT` (alasan koreksi/perubahan)
         * `created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL`
       - Aktifkan RLS pada `public.audit_logs` dan buat policy untuk role admin dan operator agar dapat membaca serta menambah log.
       - Buat fungsi PostgreSQL `public.update_purchase_invoice_atomic`:
         * Parameter:
           - `p_purchase_id UUID`
           - `p_invoice_number TEXT`
           - `p_purchase_date DATE`
           - `p_items JSONB` (berisi array objek: `[{ product_id: UUID, qty: INT, buy_price: NUMERIC }]`)
           - `p_change_reason TEXT`
           - `p_user_id UUID`
           - `p_user_name TEXT DEFAULT NULL`
         * Logika fungsi:
           a. Validasi alasan perubahan (`p_change_reason`), minimal 10 karakter. Jika kurang, lemparkan exception.
           b. Ambil snapshot data lama dari `purchases` dan `purchase_items` untuk disimpan di `old_data`.
           c. Lakukan rekonsiliasi delta stok produk:
              - Untuk setiap produk pada faktur lama vs item baru, hitung selisih: `delta = (new_qty - old_qty)`.
              - Cek stok master produk di tabel `products`.
              - Jika `(products.stock + delta) < 0`, gagalkan transaksi (`RAISE EXCEPTION`) dengan pesan deskriptif bahwa stok produk tidak mencukupi untuk dikurangi karena sebagian barang sudah terjual.
              - Jika valid, perbarui `products.stock = products.stock + delta` dan update `buy_price = new_buy_price`.
           d. Perbarui item pada `purchase_items` (hapus item lama yang terkait `p_purchase_id` lalu masukkan item baru atau lakukan upsert).
           e. Hitung ulang total faktur: `v_total_amount = SUM(item.qty * item.buy_price)`.
           f. Perbarui header tabel `purchases`: `invoice_number = p_invoice_number`, `purchase_date = p_purchase_date`, `total_amount = v_total_amount`.
           g. Simpan catatan ke `public.audit_logs`:
              `INSERT INTO public.audit_logs (entity_name, entity_id, action, old_data, new_data, performed_by, performer_name, notes)`
           h. Kembalikan JSON hasil berupa status sukses, id faktur, total nilai baru, dan waktu pencatatan.
  </action>
  <verify>
    Periksa sintaks SQL migration menggunakan static review: tabel `audit_logs` memiliki kolom yang tepat, RLS policies aktif, dan fungsi RPC `update_purchase_invoice_atomic` menangani validasi delta kuantitas dan rollback transaksi saat stok tidak cukup.
  </verify>
  <done>
    Berkas migrasi `023_purchase_audit_and_stock_adjustment.sql` terbentuk dengan skema tabel audit_logs dan RPC atomik lengkap.
  </done>
</task>

## Success Criteria
- [ ] Berkas migrasi `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql` terbuat secara valid.
- [ ] Tabel `audit_logs` didefinisikan dengan RLS dan hak akses pengelola (admin & operator).
- [ ] Fungsi RPC `update_purchase_invoice_atomic` menerapkan validasi panjang alasan (min 10 karakter), pencegahan stok minus (`stock + delta < 0`), serta pencatatan snapshot log ke `audit_logs`.

