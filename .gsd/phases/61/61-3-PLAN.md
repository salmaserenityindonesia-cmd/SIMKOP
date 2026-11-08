---
phase: 61
plan: 3
wave: 3
gap_closure: false
---

# Plan 61.3: Static Verification, Vitest Suite & Production Build Verification

## Objective
Melakukan audit dan verifikasi menyeluruh pada seluruh berkas yang dimodifikasi dan ditambahkan pada Phase 61:
1. Pengecekan tipe statis TypeScript (`tsc --noEmit`).
2. Menjalankan seluruh test suite Vitest pada project SIMKOP untuk memastikan tidak ada efek samping maupun regresi.
3. Menjalankan bundling produksi Vite (`npm run build`) untuk memastikan aplikasi siap deploy.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/components/loans/LoanScheduleModal.tsx
- src/pages/admin/LoanMatrix.tsx

## Tasks

<task type="auto">
  <name>Full Project Verification and Build Check</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan TypeScript strict typechecking:
       `npx tsc --noEmit`
    2. Jalankan seluruh unit test suite terkait modul pinjaman dan matriks:
       `npx vitest run src/services/loanMatrixService.test.ts src/components/loans/LoanScheduleModal.test.tsx src/pages/admin/LoanMatrix.test.tsx`
    3. Jalankan full vitest test run:
       `npm test`
    4. Jalankan production build bundler:
       `npm run build`
  </action>
  <verify>
    npx tsc --noEmit && npm run build
  </verify>
  <done>
    TypeScript clean 0 errors, Vitest pass 100%, dan Vite production build sukses.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `npx tsc --noEmit` keluar dengan exit code 0 tanpa komplain tipe data.
- [ ] `npm run build` berhasil menghasilkan bundle di folder `dist/`.

## Success Criteria
- [ ] Fitur buku bantu angsuran pinjaman interaktif terverifikasi bersih dan siap pakai di production.
