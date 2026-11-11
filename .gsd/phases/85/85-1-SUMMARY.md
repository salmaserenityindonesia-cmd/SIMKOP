# Phase 85 Plan 1: Database Migration for Batch Cycles and Atomic RPC - Summary

## Summary
Membangun migration PostgreSQL `046_create_lebaran_disbursement_cycles.sql` yang mendefinisikan tabel persistensi siklus pencairan massal simpanan lebaran (`public.lebaran_disbursement_cycles`) dan fungsi PostgreSQL RPC atomik (`public.execute_bulk_lebaran_disbursement`) untuk mengeksekusi penarikan 100% saldo simpanan lebaran seluruh anggota berstatus aktif secara serentak, aman dari race condition dengan row-locking (`FOR UPDATE`), membuat nomor kwitansi unik `KW-THR-[YEAR]-[NRP]`, serta mencatat jejak audit dan pengeluaran kas (`cash_flow`).

## Tasks Completed
| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| 1 | Create Cycles Table and execute_bulk_lebaran_disbursement RPC | Completed | `ea4aafe9` |

## Changes Made
- `supabase/migrations/046_create_lebaran_disbursement_cycles.sql`:
  - Membuat tabel `public.lebaran_disbursement_cycles` dengan kolom `id`, `cycle_name`, `cut_off_date`, `total_members`, `total_amount`, `status` (`DRAFT`, `APPROVED`, `COMPLETED`, `REJECTED`), `notes`, `created_by`, `approved_by`, `approved_at`, `created_at`, `updated_at`.
  - Menambahkan indeks pada `status`, `cut_off_date`, dan `created_at`.
  - Mengaktifkan Row Level Security (RLS) dengan policy akses untuk role `authenticated` dan `anon`.
  - Memastikan kolom pendukung pada `deposit_transactions` (`transaction_date`, `reference_no`, `payment_method`, `notes`, `created_by`) dan indeks referensi tersedia.
  - Mendefinisikan RPC `public.execute_bulk_lebaran_disbursement(p_cycle_id UUID, p_approver_id UUID)` dengan mode `SECURITY DEFINER`:
    * Validasi status siklus dan penguncian baris dengan `SELECT ... FOR UPDATE`.
    * Validasi ID penyetuju (approver) terhadap `auth.users`.
    * Perhitungan saldo berjalan simpanan lebaran anggota aktif (`anggota.status = 'aktif'`) berdasarkan deposit types ('LEBARAN', 'SL', 'Hari Raya').
    * Filter anggota bersaldo > 0.
    * Penerbitan nomor bukti kwitansi unik `KW-THR-[YEAR]-[NRP]`.
    * Penyisipan mutasi penarikan 100% saldo ke `deposit_transactions` dan pencatatan arus kas keluar ke `cash_flow`.
    * Pembaruan status siklus menjadi `COMPLETED` berserta total anggota dan total dana tercairkan.
    * Pencatatan jejak audit batch ke `audit_logs`.
    * Pemberian izin eksekusi (`GRANT EXECUTE`) kepada `authenticated`, `anon`, dan `service_role`.

## Verification Results
- **SQL Integrity & Structure**:
  - Deklarasi variabel, exception handling, parameter checking, dan constraint check telah divalidasi.
- **Vitest Suite**:
  - `npx vitest run` (65 files passed, 952 tests passed).
- **TypeScript Typecheck**:
  - `npx tsc --noEmit` (0 errors).

## Deviations
None.

## Deferred
- Out-of-scope uncommitted files in working tree from previous phases (`dist/index.html`, `src/pages/admin/LaporanPenarikanSimpanan.*`, `src/services/withdrawalReportService.*`) were untouched and kept preserved.
