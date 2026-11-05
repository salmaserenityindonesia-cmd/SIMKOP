# Plan 58.2 Summary: Interactive Audit & Evidence Modal UI and Compliance Matrix Tooltip

## Execution Details
- **Phase**: 58
- **Plan**: 2
- **Wave**: 2
- **Status**: Completed

## Changes Made
1. **`src/components/compliance/SavingsLedgerMatrixModal.tsx`**:
   - Menambahkan state manajemen dialog interaktif: `evidenceModalOpen`, `uncheckModalOpen`, dan `historyModalOpen`.
   - Mengintegrasikan dialog input bukti setoran (`data-testid="evidence-modal"`): form input nominal setoran (mendukung nominal parsial), nomor bukti kwitansi otomatis (format `KW-YYYY/MM/NRP`), opsi metode pembayaran (`tunai`, `potong_gaji`, `transfer`), dan catatan tambahan.
   - Mengintegrasikan dialog konfirmasi pembatalan centang (`data-testid="uncheck-modal"`): menyertakan peringatan pencatatan ke Jejak Audit (Audit Logs) dan validasi wajib input alasan pembatalan.
   - Mengintegrasikan drawer/modal penampil riwayat audit kronologis (`data-testid="history-modal"`): menampilkan daftar jejak mutasi lengkap per periode (waktu, admin pelaksana, nomor bukti, metode pembayaran, catatan/alasan) dari gabungan tabel `deposit_transactions` dan `audit_logs`.
   - Menambahkan tombol aksi riwayat audit (`FileText`) pada tiap sel bulan bergrid.
2. **`src/components/compliance/SavingsLedgerMatrixModal.test.tsx`**:
   - Menambahkan test suite komprehensif menguji rendering tombol riwayat audit per sel bulan, form input bukti setoran, modal konfirmasi uncheck dengan alasan pembatalan, dan penampil jejak riwayat audit kronologis.
3. **`src/services/complianceService.ts`**:
   - Menambahkan kolom `reference_no` dan `notes` pada pemanggilan `fetchAllPaged('deposit_transactions', ...)`.
   - Memperluas interface `SavingsSubItem` untuk mendukung `reference_no` dan `notes`.
   - Memetakan `ref_w`, `ref_b`, `ref_l`, `notes_w`, `notes_b`, dan `notes_l` pada agregasi setoran bulanan dan meneruskannya ke `wajibItem`, `belanjaItem`, dan `lebaranItem`.
4. **`src/pages/admin/ComplianceMatrix.tsx`**:
   - Menambahkan tampilan nomor bukti kwitansi (`data-testid="tooltip-ref-..."`) dan catatan penyesuaian pada tooltip hover sel bulan untuk Simpanan Wajib, Belanja, dan Lebaran.
5. **`src/pages/admin/ComplianceMatrix.test.tsx`**:
   - Menambahkan unit test validasi tooltip hover untuk memastikan nomor kwitansi dan catatan transaksi setoran ter-render dengan benar.

## Verification Results
- `npx vitest run src/components/compliance/SavingsLedgerMatrixModal.test.tsx`:
  - 24/24 tests passed (100% pass).
- `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`:
  - 46/46 tests passed (100% pass).
- `npx tsc --noEmit`:
  - Clean TypeScript compilation, 0 errors.

## Commits Landed
- `50983ba1` feat(phase-58): add evidence modal uncheck dialog and audit history to savings ledger
- `9c0dfe11` feat(phase-58): expose evidence reference in compliance service and matrix tooltip
