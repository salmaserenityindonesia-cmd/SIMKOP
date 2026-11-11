---
phase: 90
plan: 1
wave: 1
gap_closure: false
---

# Plan 90.1: Database Migration for Atomic Financial Reset RPC

## Objective
Menyiapkan berkas migrasi database PostgreSQL RPC `reset_financial_transactions(p_admin_id uuid)` berstatus `SECURITY DEFINER` untuk mereset seluruh transaksi arus kas masuk dan keluar secara atomik tanpa merusak master data anggota maupun stok produk.

## Context
- `supabase/migrations/040_create_reset_financial_transactions_rpc.sql`
- Tabel Terkait:
  - `public.sale_items`
  - `public.store_credit_payments`
  - `public.sales`
  - `public.transaksi_item` (legacy POS jika ada)
  - `public.transaksi` (legacy POS jika ada)
  - `public.cashier_shifts`
  - `public.deposit_transactions`
  - `public.cash_flow`
  - `public.audit_logs`

## Tasks

<task type="auto">
  <name>Create reset_financial_transactions Database RPC Migration</name>
  <files>
    supabase/migrations/040_create_reset_financial_transactions_rpc.sql
  </files>
  <action>
    Buat berkas migrasi `supabase/migrations/040_create_reset_financial_transactions_rpc.sql`:
    1. Definisikan fungsi RPC `public.reset_financial_transactions(p_admin_id uuid DEFAULT NULL)` bertipe `SECURITY DEFINER` dengan return `jsonb`.
    2. Bersihkan transaksi penjualan kasir retail POS:
       - Hapus seluruh baris `public.sale_items`.
       - Hapus seluruh baris `public.store_credit_payments` jika tabel ada.
       - Hitung jumlah data `public.sales`, lalu hapus seluruh baris `public.sales`.
       - Bersihkan tabel legacy POS (`transaksi_item` dan `transaksi`) jika tabel ada.
    3. Bersihkan sesi shift kasir:
       - Hapus seluruh baris `public.cashier_shifts` jika tabel ada.
    4. Kembalikan hak simpanan anggota dengan menghapus riwayat pencairan/penarikan seluruh jenis simpanan:
       - Hitung dan hapus dari `public.deposit_transactions` di mana `transaction_type IN ('withdrawal', 'termination') OR description ILIKE '%penarikan%' OR description ILIKE '%pencairan%' OR description ILIKE '%belanja kasir%'`.
    5. Bersihkan riwayat arus kas utama:
       - Hitung dan hapus seluruh baris `public.cash_flow`.
    6. Catat aktivitas reset ke `public.audit_logs`:
       - Tangani `p_admin_id` dengan validasi foreign key ke `auth.users` atau fallback NULL / `auth.uid()`.
       - Catat aksi `RESET_ALL`, tabel `financial_transactions`, `record_id: SYSTEM_WIDE`.
    7. Berikan izin eksekusi (`GRANT EXECUTE ON FUNCTION public.reset_financial_transactions(uuid) TO authenticated, anon, service_role`).
  </action>
  <verify>
    Periksa sintaks SQL migration memastikan tidak ada sintaks invalid dan seluruh klausa aman (menggunakan IF EXISTS atau penanganan constraint foreign key).
  </verify>
  <done>
    Fungsi reset_financial_transactions terdefinisi secara atomik di berkas migrasi Supabase dan siap dieksekusi.
  </done>
</task>

## Success Criteria
- [ ] Berkas `supabase/migrations/040_create_reset_financial_transactions_rpc.sql` terbuat dengan sintaks PostgreSQL valid.
- [ ] Menghapus `sale_items`, `sales`, `store_credit_payments`, `cashier_shifts`, `transaksi`, `transaksi_item`.
- [ ] Menghapus penarikan simpanan pada `deposit_transactions` tanpa menghapus setoran simpanan masuk.
- [ ] Menghapus seluruh baris `cash_flow`.
- [ ] Mencatat log ke `audit_logs` dan mengembalikan JSONB status.

