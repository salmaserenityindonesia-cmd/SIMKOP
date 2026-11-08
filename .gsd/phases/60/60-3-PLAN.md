---
phase: 60
plan: 3
wave: 3
gap_closure: false
---

# Plan 60.3: Static Verification, Vitest Suite & Production Build Verification

## Objective
Menjalankan pengujian regresi end-to-end melalui static type checking TypeScript, seluruh test suite Vitest, serta memvalidasi kesiapan production build Vite tanpa peringatan atau error kritis.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/pages/admin/LoanMatrix.tsx

## Tasks

<task type="auto">
  <name>Comprehensive Static Analysis and Full Test Suite Run</name>
  <files>
    src/services/loanMatrixService.ts
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Jalankan TypeScript compiler check secara ketat tanpa emisi file:
       `npx tsc --noEmit`
    2. Jalankan seluruh suite pengujian unit Vitest proyek:
       `npx vitest run`
    3. Pastikan tidak ada kegagalan pengujian pada komponen lain di luar modul loan matrix.
  </action>
  <verify>
    npx tsc --noEmit && npx vitest run
  </verify>
  <done>
    TypeScript clean (0 error) dan seluruh pengujian Vitest lulus 100%.
  </done>
</task>

<task type="auto">
  <name>Production Bundle Build Verification</name>
  <files>
    dist/
  </files>
  <action>
    1. Jalankan proses bundling produksi aplikasi:
       `npm run build`
    2. Verifikasi bahwa aset produksi berhasil dibuild ke folder `dist` dengan exit code 0.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Vite build berhasil tanpa error atau pemutusan proses.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `tsc --noEmit` lulus dengan exit code 0.
- [ ] `npx vitest run` seluruh test suite proyek lulus 100%.
- [ ] `npm run build` menghasilkan bundle produksi yang valid.

## Success Criteria
- [ ] Modul matriks pinjaman stabil dan siap digunakan di production.
- [ ] Tidak ada regresi pada build atau runtime.

