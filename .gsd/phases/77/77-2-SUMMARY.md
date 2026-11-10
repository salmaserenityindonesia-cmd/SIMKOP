# Summary: Plan 77.2 - Render Multi-Loan Rows and Update Statistics in UI & Modal

## Overview
Plan 77.2 memperbarui representasi tabel matriks pinjaman di `src/pages/admin/LoanMatrix.tsx` untuk menampilkan setiap pinjaman aktif dalam baris tersendiri dengan identitas lengkap (nama anggota, NRP, badge jenis pinjaman beserta tenor, dan nomor pinjaman). Tombol aksi buku bantu (`Eye` icon) sekarang terhubung ke `loanId` yang spesifik untuk baris tersebut. Ekspor Excel telah diperbarui dengan kolom nomor pinjaman dan jenis pinjaman, serta pagination footer mencerminkan jumlah pinjaman dan jumlah anggota unik secara akurat.

## Changes Completed

1. **Table Row Rendering per Loan in `LoanMatrix.tsx`**:
   - Baris matriks menggunakan unique key: `row.id || row.loanId || `${row.memberId}-${row.loanNumber}``.
   - Kolom **Anggota** menyajikan badge jenis pinjaman (`{loanTypeName} ({tenor} Bln)`), status pinjaman aktif/selesai, dan nomor pinjaman (`loan_number` / `loanNumber`).
   - Kolom **Aksi** mengaitkan tombol mata ke `targetLoanId = row.loanId || row.id || Object.values(row.months).find(m => m.loanId)?.loanId`, membuka `LoanLedgerModal` dengan kredensial pinjaman spesifik tersebut.
   - Kolom Excel Export diperkaya dengan header dan data 'No. Pinjaman', 'Jenis Pinjaman', dan 'Tenor (Bulan)'.
   - Footer pagination diperbarui: `Menampilkan X-Y dari {totalFiltered} pinjaman ({uniqueMembersCount} anggota)`.

2. **Interactive Grid Modal Support & Unit Testing**:
   - `LoanMatrixProps` mendukung `initialSelectedLoan` opsional untuk mempermudah pengujian dan integrasi modal.
   - Header modal pada `LoanScheduleModal.tsx` memvalidasi nomor pinjaman (`data?.loanNumber`), tenor (`data?.tenor`), dan tanggal pencairan (`data?.disbursedAt`).
   - Aksi cepat pada `LoanScheduleModal` (Centang Semua, Rekonsiliasi FIFO, Batal Centang) beroperasi secara terisolasi pada `loanId` spesifik yang dibuka.
   - Menambahkan unit test komprehensif di `src/pages/admin/LoanMatrix.test.tsx` untuk memverifikasi anggota dengan multi-pinjaman:
     - 2 baris terpisah ter-render untuk anggota dengan 2 pinjaman aktif.
     - Badge jenis pinjaman, tenor, dan nomor pinjaman masing-masing ter-render dengan akurat.
     - Tombol aksi buku bantu menghasilkan target `loanId` spesifik untuk setiap pinjaman.
     - Modal buku bantu menerima prop `loanId`, `memberNrp`, dan `memberName` yang sesuai.

## Verification
- Vitest unit tests:
  - `npx vitest run src/pages/admin/LoanMatrix.test.tsx` -> 31/31 tests PASS (100%).
  - `npx vitest run src/components/loans/LoanScheduleModal.test.tsx` -> 25/25 tests PASS (100%).
  - `npx vitest run src/services/loanMatrixService.test.ts` -> 39/39 tests PASS (100%).
  - Full suite (`npx vitest run`) -> 61 test files, 872/872 tests PASS.
- TypeScript verification:
  - `npx tsc --noEmit` -> Exited 0 with no diagnostic errors.

## Commits Landed
- `426cc39c feat(phase-77): render distinct rows per loan and update table action in loanmatrix`
- `bae0f25c feat(phase-77): ensure interactive grid modal support and ui unit testing`
