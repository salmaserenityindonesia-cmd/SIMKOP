---
phase: 76
plan: 3
wave: 3
gap_closure: false
---

# Plan 76.3: Comprehensive Unit Testing, Static Verification & Production Build

## Objective
Melakukan pengujian komprehensif pada unit test suite (`PengajuanPinjaman.test.tsx` dan `loanService.test.ts`), melakukan verifikasi pemeriksaan tipe TypeScript statis (`tsc --noEmit`), serta memastikan build produksi Vite (`npm run build`) berjalan bersih tanpa error dengan exit code 0.

## Context
Load these files for context:
- `src/pages/admin/PengajuanPinjaman.test.tsx`
- `src/services/loanService.test.ts`
- `src/pages/admin/PengajuanPinjaman.tsx`

## Tasks

<task type="auto">
  <name>Update and Extend Unit Tests for Dynamic Loan Types and Tenor Filtering</name>
  <files>
    src/pages/admin/PengajuanPinjaman.test.tsx,
    src/services/loanService.test.ts
  </files>
  <action>
    1. Di `src/pages/admin/PengajuanPinjaman.test.tsx`:
       - Tambahkan mock data `loan_types` (misal: DARURAT maks 6 bulan, REGULER maks 12 bulan).
       - Tambahkan test case:
         a. Dropdown jenis pinjaman dirender dengan daftar opsi yang benar.
         b. Dropdown tenor berstatus disabled jika belum ada jenis pinjaman yang dipilih.
         c. Pemilihan pinjaman DARURAT menghasilkan pilihan tenor maksimal 6 bulan (tidak ada 10, 12, 18, dsb).
         d. Pemilihan pinjaman REGULER menghasilkan pilihan tenor maksimal 12 bulan (tidak ada 18, 24, 30, 36).
         e. Simulasi panel rekomendasi tenor tidak melampaui `maxTenor` produk terkait.
         f. Submit form berhasil menyertakan `loan_type_id`.
    2. Di `src/services/loanService.test.ts`:
       - Tambahkan pengujian fungsi `getActiveLoanTypes()`.
       - Tambahkan pengujian fungsi `applyLoan` dengan `loanTypeId` eksplisit.
  </action>
  <verify>
    Jalankan tes vitest:
    `npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx src/services/loanService.test.ts`
    Semua test harus lulus (passing) 100%.
  </verify>
  <done>
    Seluruh test skenario integrasi jenis pinjaman dan tenor dinamis lulus dengan cakupan pengujian lengkap.
  </done>
</task>

<task type="auto">
  <name>Static Type Check and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan pemeriksaan tipe TypeScript tanpa emisi:
       `npx tsc --noEmit`
    2. Jalankan build produksi Vite:
       `npm run build`
    3. Pastikan tidak ada error kompilasi, warning fatal, atau regresi pada modul aplikasi lainnya.
  </action>
  <verify>
    - `npx tsc --noEmit` keluar dengan exit code 0.
    - `npm run build` menghasilkan bundle produksi di folder `dist/` dengan exit code 0.
  </verify>
  <done>
    Fasilitas integrasi jenis pinjaman dan tenor dinamis pada pengajuan pinjaman baru siap dirilis ke environment production.
  </done>
</task>

## Success Criteria
- [ ] Unit tests di `PengajuanPinjaman.test.tsx` dan `loanService.test.ts` lulus 100%.
- [ ] Tidak ada error tipe TypeScript (`tsc --noEmit`).
- [ ] Vite build produksi sukses dengan exit code 0.

