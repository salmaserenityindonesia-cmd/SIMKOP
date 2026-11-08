---
phase: 64
plan: 2
wave: 2
gap_closure: false
---

# Plan 64.2: Static Verification, Full Vitest Suite & Production Build Verification

## Objective
Melakukan verifikasi menyeluruh (quality gate) terhadap perubahan tata letak toolbar matriks pinjaman:
1. Pengecekan tipe statis TypeScript tanpa error (`tsc --noEmit`).
2. Menjalankan seluruh test suite Vitest unit & component testing.
3. Memastikan build bundler Vite produksi (`npm run build`) berhasil 100% tanpa error atau warning kritis.

## Context
Load these files for context:
- src/pages/admin/LoanMatrix.tsx
- src/pages/admin/LoanMatrix.test.tsx

## Tasks

<task type="auto">
  <name>Comprehensive Test Suite & Static Typecheck</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Jalankan TypeScript compiler typecheck:
       `npx tsc --noEmit`
    2. Jalankan targeted tests untuk modul matriks pinjaman:
       `npx vitest run src/pages/admin/LoanMatrix.test.tsx`
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
    Build produksi terverifikasi bersih dan siap rilis.
  </done>
</task>

## Success Criteria
- [ ] `tsc --noEmit` keluar dengan 0 error.
- [ ] Seluruh unit test suite Vitest lolos 100%.
- [ ] `npm run build` selesai tanpa error dengan exit code 0.

