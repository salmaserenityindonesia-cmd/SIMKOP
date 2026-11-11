# Plan 90.1 Summary: Database Migration for Atomic Financial Reset RPC

## Metadata
- **Phase**: 90
- **Plan**: 1
- **Wave**: 1
- **Status**: Completed
- **Commit**: `53ee4394`

## Tasks Completed

| Task | Name | Files | Commit |
|---|---|---|---|
| 1 | Create reset_financial_transactions Database RPC Migration | `supabase/migrations/040_create_reset_financial_transactions_rpc.sql` | `53ee4394` |

## Key Changes
1. **PostgreSQL RPC `reset_financial_transactions(p_admin_id uuid DEFAULT NULL)`**:
   - Dibuat dengan modifier `SECURITY DEFINER` dan tipe kembalian `jsonb`.
   - Membersihkan transaksi penjualan kasir retail POS: `store_credit_payments`, `sale_items`, `sales`, dan tabel legacy (`transaksi_item`, `transaksi`).
   - Membersihkan seluruh riwayat sesi shift kasir pada `cashier_shifts`.
   - Membersihkan siklus pencairan THR pada `lebaran_disbursement_cycles` (jika ada).
   - Mengembalikan hak simpanan anggota dengan menghapus riwayat penarikan, pencairan, dan potongan belanja simpanan (`deposit_transactions` dengan filter `transaction_type IN ('withdrawal', 'termination') OR description ILIKE '%penarikan%' OR description ILIKE '%pencairan%' OR description ILIKE '%belanja kasir%' OR payment_method = 'potong_simpanan_belanja'`).
   - Mengosongkan riwayat arus kas utama pada tabel `cash_flow`.
   - Mencatat aksi pembersihan ke `audit_logs` (`table_name: 'financial_transactions'`, `action: 'RESET_ALL'`, `record_id: 'SYSTEM_WIDE'`) dengan validasi foreign key `p_admin_id` ke `auth.users` serta fallback ke `auth.uid()`.
   - Memberikan izin eksekusi (`GRANT EXECUTE ON FUNCTION public.reset_financial_transactions(UUID) TO authenticated, anon, service_role`).

## Verification
- Validasi sintaks SQL: Seluruh klausa DDL dan DML menggunakan pemeriksaan keberadaan tabel (`information_schema.tables`), penanganan fallback UUID foreign key yang aman, serta return JSONB yang cocok dengan tipe kontrak aplikasi.

## Deferred / Out of Scope
- Modifikasi yang sudah ada di working tree (`src/pages/admin/ComplianceMatrix.tsx`, `src/services/savingsMatrixService.ts`) dibiarkan utuh dan tidak disertakan ke dalam commit migrasi ini sesuai prinsip isolasi per-task.
