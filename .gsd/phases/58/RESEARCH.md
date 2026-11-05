# Phase 58: Research & Architecture Analysis
Implementasi Jejak Audit & Dokumentasi Bukti Pembayaran pada Matriks Simpanan

## 1. Context & Objective
Memperkuat Buku Besar Matriks Simpanan (`/admin/compliance-matrix` dan `SavingsLedgerMatrixModal.tsx`) menjadi sistem pencatatan yang akuntabel, transparan, dan dapat diaudit secara situasional.
Setiap perubahan centang (pencatatan setoran bulanan, setoran parsial, dan pembatalan centang / uncheck) wajib mencatat metadata bukti:
- Nomor Referensi / Kwitansi (e.g. `KW-2026/11/01`)
- Metode Pembayaran (`tunai`, `potong_gaji`, `transfer`)
- Catatan / Keterangan Penyesuaian
- Identitas Admin Pencatat (`created_by`) dan Timestamp (`created_at`)
- Audit Trail terintegrasi ke `public.audit_logs` saat terjadi pembatalan/penghapusan centang (disertai alasan pembatalan).

## 2. Codebase Discovery & Existing State
- **Database (`supabase/migrations/`)**:
  - `deposit_transactions` saat ini menyimpan: `id`, `member_deposit_id`, `amount`, `transaction_type`, `for_month`, `for_year`, `description`, `created_at`.
  - Belum ada kolom: `reference_no`, `payment_method`, `notes`, `created_by`.
  - Migrasi terakhir di repo adalah `033_create_member_net_savings_view.sql`. Oleh karena itu migrasi baru dinomori `034_add_audit_and_reference_to_deposit_transactions.sql`.
  - `public.audit_logs` sudah memiliki skema lengkap (`table_name`, `action`, `record_id`, `old_data`, `performed_by`, `notes`, `created_at`).
- **Service Layer (`src/services/savingsMatrixService.ts`)**:
  - Tipe payload dan fungsi mutasi centang didefinisikan modular:
    ```typescript
    export interface CheckMonthPayload {
      memberDepositId: string;
      month: number;
      year: number;
      amount: number;
      referenceNo?: string;
      paymentMethod?: string;
      notes?: string;
      reason?: string;
    }
    ```
  - Fungsi penarik riwayat audit per sel:
    `getMonthAuditHistory(memberDepositId: string, year: number, month: number)`
    Mengambil mutasi aktif di `deposit_transactions` dan mutasi yang pernah dihapus dari `audit_logs`.
- **UI Layer (`src/components/compliance/SavingsLedgerMatrixModal.tsx`)**:
  - Sel checkbox diperbarui:
    1. Klik sel kosong -> Buka Popover/Modal Dialog "Input Bukti Setoran" (Nominal, Nomor Kwitansi, Metode Bayar, Catatan).
    2. Klik sel tercentang -> Buka Dialog Konfirmasi Pembatalan dengan input wajib Alasan Pembatalan.
    3. Action Button / Icon "Riwayat Audit" pada tiap sel -> Tampilkan riwayat kronologis lengkap (siapa, kapan, nomor bukti, catatan).
- **Matrix View (`src/pages/admin/ComplianceMatrix.tsx`)**:
  - Query `getComplianceMatrixData` menyertakan `reference_no` dan `notes`.
  - Hover tooltip sel bulan diperkaya dengan nomor referensi dan catatan.

## 3. Plan Decomposition Strategy (Aggressive Atomicity)
- **Plan 58.1 (Wave 1 & Wave 2)**: Database Schema Migration & Service Layer Support for Evidence Documentation
- **Plan 58.2 (Wave 3)**: Interactive Evidence Input Popover, Uncheck Confirmation Modal & History Viewer in UI
- **Plan 58.3 (Wave 4)**: Static Verification, Unit Testing & End-to-End Build Check

