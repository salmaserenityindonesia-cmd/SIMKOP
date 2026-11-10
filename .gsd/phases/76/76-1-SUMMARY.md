# Phase 76 Plan 1: Active Loan Types Service & Dynamic Tenor State Generation Summary

## Executive Summary
Implementasi Plan 76.1 berhasil diselesaikan secara menyeluruh. Service `loanService` kini mendukung pengambilan daftar jenis pinjaman aktif (`getActiveLoanTypes`) dan menerima parameter opsional `loanTypeId` pada `applyLoan` dengan fallback backward-compatible. Di tingkat halaman pengajuan pinjaman (`PengajuanPinjaman.tsx`), state jenis pinjaman dan kalkulasi batas tenor dinamis (`availableTenors`, `maxTenor`) telah terpasang bersama proteksi filter batas tenor pada `SimulationPanel`.

## Key Changes
1. **`src/services/loanService.ts`**:
   - Menambahkan import `LoanType` dari `./koperasiService`.
   - Mengimplementasikan dan mengekspor fungsi `getActiveLoanTypes(): Promise<LoanType[]>`.
   - Mendaftarkan `getActiveLoanTypes` ke dalam objek `loanService`.
   - Memperbarui `loanService.applyLoan(memberId, purpose, amount, tenor, loanTypeId?)` agar menyisipkan `loan_type_id: targetLoanTypeId` pada payload `loans.insert(...)`, dengan query fallback ke tipe pinjaman aktif pertama jika `loanTypeId` tidak diberikan.
2. **`src/pages/admin/PengajuanPinjaman.tsx`**:
   - Mengimpor `getActiveLoanTypes` dan `LoanType`.
   - Memperluas `PengajuanPinjamanProps` dengan properti `initialLoanTypes?: LoanType[]` dan `initialSelectedLoanTypeId?: string`.
   - Menambahkan state `loanTypes` dan `selectedLoanTypeId`.
   - Memanggil `getActiveLoanTypes()` pada `useEffect` mount saat `initialLoanTypes` tidak disuplai.
   - Menghitung opsi tenor dinamis berbasis `max_duration_months` jenis pinjaman terpilih:
     - `maxTenor`: default 12 jika belum ada tipe terpilih, atau sesuai `selectedLoanType.max_duration_months`.
     - `availableTenors`: menyaring daftar tenor dasar agar tidak melebihi `maxTenor`.
     - Mengekspor helper murni `calculateAvailableTenors(maxTenor?: number)`.
   - Menambahkan handler `handleLoanTypeChange(newTypeId: string)` yang otomatis mereset `tenor` jika tenor yang sedang terpilih melebihi batas maksimal tipe pinjaman baru.
   - Memperbarui `SimulationPanelProps` dan komponen `SimulationPanel` untuk menerima `maxTenor?: number` dan menyaring rekomendasi tenor kelayakan agar tidak pernah merekomendasikan tenor yang melampaui `maxTenor`.
3. **`src/pages/admin/PengajuanPinjaman.test.tsx`**:
   - Menambahkan pengujian `calculateAvailableTenors` untuk batas tenor 6 bulan, 12 bulan, 36 bulan, dan undefined.
   - Menambahkan pengujian `SimulationPanel` dengan batasan `maxTenor = 12` memastikan tidak memunculkan rekomendasi tenor di atas 12 bulan meskipun plafon pinjaman tinggi.

## Verification Evidence
- `npx tsc --noEmit`: 0 error tipe.
- `npm test -- src/pages/admin/PengajuanPinjaman.test.tsx src/services/loanService.test.ts --run`: 45/45 pengujian lolos.
- `npm test`: 852/852 pengujian lolos di seluruh 61 test files.

## Commits Landed
- `2cfdac39`: `feat(phase-76): extend loanService to fetch active loan types and accept loanTypeId`
- `b08805ae`: `feat(phase-76): implement dynamic tenor calculation and loan type state in PengajuanPinjaman`
