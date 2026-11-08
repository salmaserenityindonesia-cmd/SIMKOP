---
phase: 63
plan: 2
wave: 2
gap_closure: false
---

# Plan 63.2: Static Verification, Vitest Suite & Production Build Verification

## Objective
Melakukan verifikasi menyeluruh (clean quality gate) terhadap perubahan modal pelunasan angsuran dan service:
1. Pengecekan tipe statis TypeScript tanpa error (`tsc --noEmit`).
2. Menjalankan seluruh test suite Vitest unit & component testing.
3. Memastikan build bundler Vite produksi (`npm run build`) berhasil 100% tanpa error atau warning kritis.

## Context
Load these files for context:
- src/components/loans/LoanScheduleModal.tsx
- src/components/loans/LoanScheduleModal.test.tsx
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts
- src/services/loanService.ts

## Tasks

<task type="auto">
  <name>Comprehensive Test Suite & Static Typecheck</name>
  <files>
    src/components/loans/LoanScheduleModal.tsx
    src/components/loans/LoanScheduleModal.test.tsx
    src/services/loanMatrixService.ts
    src/services/loanMatrixService.test.ts
    src/services/loanService.ts
  </files>
  <action>
    1. Jalankan TypeScript compiler typecheck:
       `npx tsc --noEmit`
    2. Jalankan targeted tests untuk modul matriks pinjaman dan modal:
       `npx vitest run src/services/loanMatrixService.test.ts src/components/loans/LoanScheduleModal.test.tsx`
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
- [ ] `tsc --noEmit` keluar dengan 0 error
- [ ] Seluruh unit dan integration test Vitest lulus (100% pass)
- [ ] `npm run build` menghasilkan bundle produksi dengan exit code 0

