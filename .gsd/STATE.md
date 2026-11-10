## Current Position
- **Phase**: 77 (Dukung Multi-Pinjaman Berjalan per Anggota pada Matriks Pinjaman)
- **Task**: Planning complete
- **Status**: Ready for execution

## Plans Created (Phase 77)
- [ ] **Plan 77.1**: Restructure Loan Matrix Data Contract (Per-Loan Rows)
  - Wave: 1
  - Files: `src/services/loanMatrixService.ts`, `src/services/loanMatrixService.test.ts`
- [ ] **Plan 77.2**: Render Multi-Loan Rows and Update Statistics in UI & Modal
  - Wave: 2
  - Files: `src/pages/admin/LoanMatrix.tsx`, `src/components/loans/LoanScheduleModal.tsx`, `src/pages/admin/LoanMatrix.test.tsx`
- [ ] **Plan 77.3**: Static Verification & Build Integrity
  - Wave: 3
  - Files: `src/`

## Context & Objectives
Menangani kasus anggota (seperti "Yanto Santoso", NRP: 96316880) yang memiliki 2 atau lebih pinjaman aktif berjalan bersamaan:
1. Menghilangkan deduplikasi baris berbasis `member_id` di `loanMatrixService.ts` dan menggantinya dengan model baris berbasis `loan.id`.
2. Menyajikan informasi identitas pinjaman yang jelas (NRP, nama, badge jenis pinjaman + tenor, dan nomor pinjaman) pada setiap baris di tabel `LoanMatrix.tsx`.
3. Memastikan aksi buku bantu mengarah ke `loanId` yang spesifik dan kartu ringkasan KPI (Proyeksi Bulan Depan, Realisasi YTD, Kepatuhan YTD) mengakumulasi seluruh pinjaman secara menyeluruh.

## Next Steps
1. Eksekusi Wave 1 (Plan 77.1) via `/execute 77`.
