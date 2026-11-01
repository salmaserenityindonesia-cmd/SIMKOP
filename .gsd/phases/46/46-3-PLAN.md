---
phase: 46
plan: 3
wave: 3
depends_on: ["46-1", "46-2"]
gap_closure: false
---

# Plan 46.3: Component Testing, Static Verification & Production Build Check

## Objective
Menulis pengujian komponen untuk `LoanMatrix.tsx` guna memverifikasi integrasi dropdown dinamis, menjalankan validasi tipe statis TypeScript (`tsc --noEmit`), serta memastikan build produksi (`npm run build`) berjalan bersih tanpa regresi.

## Context
- `src/pages/admin/LoanMatrix.tsx`
- `src/services/loanMatrixService.ts`
- `src/services/loanMatrixService.test.ts`

## Tasks

<task type="auto">
  <name>Create Component Unit Test for LoanMatrix Dynamic Year Dropdown</name>
  <files>
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Buat berkas `src/pages/admin/LoanMatrix.test.tsx` dengan Vitest dan React Testing Library.
    2. Mock dependensi eksternal:
       - Mock `../../services/loanMatrixService`:
         * `getLoanMatrixAvailableYears`: me-resolve `[2027, 2026, 2025, 2024]`
         * `getLoanMatrix`: me-resolve objek `LoanMatrixSummary` dummy kosong/sederhana
       - Mock `../../components/layout/AdminLayout`: render children sederhana
       - Mock `exceljs`: mock minimal workbook
    3. Tes skenario:
       - Komponen me-render dropdown opsi tahun dengan opsi `2027`, `2026`, `2025`, `2024`.
       - Memilih opsi tahun baru memanggil `getLoanMatrix` dengan parameter tahun yang dipilih.
    4. Jalankan pengujian: `npx vitest run src/pages/admin/LoanMatrix.test.tsx`.
  </action>
  <verify>
    `npx vitest run src/pages/admin/LoanMatrix.test.tsx` lulus 100%.
  </verify>
  <done>
    Pengujian komponen unit test untuk dropdown tahun dinamis terverifikasi sukses.
  </done>
</task>

<task type="auto">
  <name>Full Workspace Vitest, Typecheck and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan semua unit test terkait pinjaman dan matriks:
       `npx vitest run src/services/loanMatrixService.test.ts src/pages/admin/LoanMatrix.test.tsx`
    2. Jalankan validasi tipe TypeScript:
       `npx tsc --noEmit`
    3. Jalankan Vite production build:
       `npm run build`
  </action>
  <verify>
    Seluruh test suite pinjaman lulus, `tsc --noEmit` tidak menghasilkan error, dan build Vite exit code 0.
  </verify>
  <done>
    Build produksi terverifikasi bersih dan siap rilis.
  </done>
</task>

## Success Criteria
- [ ] Unit test komponen `LoanMatrix.test.tsx` berhasil menguji render opsi tahun dinamis dan interaksi change event
- [ ] Seluruh unit test terkait lulus tanpa kegagalan
- [ ] `npx tsc --noEmit` bersih tanpa kesalahan tipe
- [ ] `npm run build` sukses dengan exit code 0
