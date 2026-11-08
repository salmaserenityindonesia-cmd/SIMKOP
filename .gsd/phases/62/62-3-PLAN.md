---
phase: 62
plan: 3
wave: 3
gap_closure: false
---

# Plan 62.3: Static Analysis, Vitest Suite & Production Build Verification

## Objective
Melakukan verifikasi menyeluruh (clean quality gate) terhadap perubahan matriks pinjaman:
1. Pengecekan tipe statis TypeScript tanpa error (`tsc --noEmit`).
2. Menjalankan seluruh test suite Vitest unit & component testing.
3. Memastikan build bundler Vite produksi (`npm run build`) berhasil 100% tanpa error atau warning kritis.

## Context
Load these files for context:
- src/pages/admin/LoanMatrix.tsx
- src/pages/admin/LoanMatrix.test.tsx
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts

## Tasks

<task type="auto">
  <name>Comprehensive Test Suite & Static Typecheck</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
    src/services/loanMatrixService.ts
    src/pages/admin/LoanMatrix.test.tsx
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Jalankan TypeScript compiler typecheck:
       `npx tsc --noEmit`
    2. Jalankan targeted tests untuk modul matriks pinjaman:
       `npx vitest run src/services/loanMatrixService.test.ts src/pages/admin/LoanMatrix.test.tsx`
    3. Jalankan full test suite aplikasi:
       `npx vitest run`
  </action>
  <verify>
    `npx tsc --noEmit` keluar dengan exit code 0 dan seluruh tes Vitest berstatus passed.
  </verify>
  <done>
    Semua pengujian dan verifikasi statis lulus tanpa kegagalan.
  </done>
</task>

<task type="auto">
  <name>Production Bundle Build Verification</name>
  <files>
    dist/
  </files>
  <action>
    1. Jalankan bundler Vite untuk build produksi:
       `npm run build`
    2. Periksa output bundler, pastikan artefak tersusun tanpa chunk error atau unresolved imports.
  </action>
  <verify>
    `npm run build` berhasil dengan exit code 0.
  </verify>
  <done>
    Aplikasi berhasil di-build untuk production secara bersih.
  </done>
</task>

## Success Criteria
- [x] `npx tsc --noEmit` menghasilkan 0 error
- [x] Seluruh unit test di Vitest lulus 100%
- [x] `npm run build` berhasil menghasilkan bundle production (exit code 0)

