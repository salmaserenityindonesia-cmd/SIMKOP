# Phase 77 Plan 1: Restructure Loan Matrix Data Contract (Per-Loan Rows) Summary

## Objective
Mengubah struktur data dan logika agregasi pada `src/services/loanMatrixService.ts` (`getLoanMatrix`) dari deduplikasi per anggota (`1 Baris = 1 Anggota`) menjadi berbasis pinjaman (`1 Baris = 1 Pinjaman Aktif/Berjalan`). Hal ini memastikan anggota dengan lebih dari satu pinjaman aktif yang berjalan bersamaan (misal Yanto Santoso) memiliki baris independen dengan jadwal angsuran, saldo berjalan, dan identitas pinjaman masing-masing.

## Key Changes
1. **Interface Contract Updates (`src/services/loanMatrixService.ts`)**:
   - Memperbarui interface `LoanMatrixMember` dan menambahkan export alias `LoanMatrixRow = LoanMatrixMember`.
   - Menambahkan properti identitas pinjaman: `id`, `loanId`, `loanNumber`, `pangkat`, `loanTypeName`, `agreedTenorMonths`, `tenor`, `monthlyTarget`, `principalAmount`, `disbursedAt`, `anggota`, dan `loan_types`.
2. **Data Query & Per-Loan Mapping**:
   - Mengubah penyimpanan baris matriks dari keyed by `member.id` menjadi keyed by `loan.id` (`const loansMap: Record<string, LoanMatrixMember> = {}`).
   - Setiap baris pinjaman mendapatkan inisialisasi 12 bulan mandiri dan kalkulasi saldo berjalan (`loanBalances[loan.id]`) serta kumulatif terbayar (`loanCumulativePaid[loan.id]`) yang terisolasi.
   - Menghitung `complianceYTD` per pinjaman dan mengaitkan jumlah pinjaman aktif per anggota (`totalLoans`).
   - Mengakumulasikan proyeksi bulan depan (`projectedNextMonth`), total target, dan total tertagih dari seluruh pinjaman aktif.
   - Menjaga penghitungan `unpaidMembersCount` berbasis anggota unik (`unpaidMembersSet.add(member.id)`).
3. **Comprehensive Unit Tests (`src/services/loanMatrixService.test.ts`)**:
   - Menambahkan test suite `loanMatrixService - Multi-Loan Support per Member`:
     - Menguji kasus anggota (Yanto Santoso) dengan 2 pinjaman aktif berjalan bersamaan (Pinjaman 30 bulan @ Rp 333.333 dan Pinjaman 12 bulan @ Rp 166.667).
     - Memverifikasi `result.members.length === 2` dengan detail baris independen.
     - Memverifikasi `projectedNextMonth` mengakumulasi angsuran dari kedua pinjaman secara bersamaan (Rp 500.000).
     - Memverifikasi `unpaidMembersCount` tetap menghitung 1 anggota unik meskipun kedua pinjaman menunggak.

## Verification Evidence
- `npx vitest run src/services/loanMatrixService.test.ts`: 39/39 tests passed (37 existing + 2 new multi-loan tests).
- `npx vitest run src/pages/admin/LoanMatrix.test.tsx`: 27/27 tests passed.

## Commits
- `9b0aa210`: feat(phase-77): allow multiple active loans per member in loan matrix query & data structure
- `3dba49bc`: test(phase-77): unit test multi-loan per member in loanMatrixService
