---
phase: 77
plan: 3
wave: 3
gap_closure: false
---

# Plan 77.3: Static Verification & Build Integrity

## Objective
Melakukan verifikasi menyeluruh terhadap kelayakan produksi SIMKOP setelah perubahan multi-pinjaman pada matriks pinjaman: memastikan seluruh test suite (`vitest`), pengecekan tipe statis TypeScript (`tsc --noEmit`), serta bundler build (`npm run build`) berhasil tanpa error maupun regresi.

## Context
Load these files for context:
- `src/services/loanMatrixService.ts`
- `src/pages/admin/LoanMatrix.tsx`
- `src/components/loans/LoanScheduleModal.tsx`

## Tasks

<task type="auto">
  <name>Comprehensive Unit Testing Across Affected Suites</name>
  <files>
    src/services/loanMatrixService.test.ts
    src/pages/admin/LoanMatrix.test.tsx
  </files>
  <action>
    1. Jalankan unit test untuk modul loan matrix:
       ```bash
       npx vitest run src/services/loanMatrixService.test.ts src/pages/admin/LoanMatrix.test.tsx
       ```
    2. Jalankan seluruh test suite aplikasi untuk memastikan tidak ada efek samping/regresi ke modul lain:
       ```bash
       npx vitest run
       ```
    3. Periksa bila ada test yang gagal atau unhandled promise rejection dan perbaiki bila ditemukan.
  </action>
  <verify>
    Vitest menyelesaikan eksekusi dengan exit code 0 dan 100% tests passing.
  </verify>
  <done>
    Semua test suite pinjaman dan modul lainnya lulus verifikasi tanpa error.
  </done>
</task>

<task type="auto">
  <name>TypeScript Typecheck and Production Vite Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan type checking TypeScript:
       ```bash
       npx tsc --noEmit
       ```
    2. Jalankan build produksi Vite:
       ```bash
       npm run build
       ```
    3. Pastikan tidak ada missing import, interface mismatch, atau build warnings yang memblokir produksi.
  </action>
  <verify>
    Command `npm run build` selesai dengan exit code 0 dan menghasilkan output di folder `dist/`.
  </verify>
  <done>
    Aplikasi berhasil dibuild untuk produksi tanpa kendala tipe atau modul.
  </done>
</task>

## Success Criteria
- [ ] Seluruh unit test suite lulus 100%.
- [ ] `npx tsc --noEmit` lolos tanpa kesalahan tipe.
- [ ] `npm run build` sukses menghasilkan bundel produksi (`dist/`).
