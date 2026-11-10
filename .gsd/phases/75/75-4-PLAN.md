---
phase: 75
plan: 4
wave: 4
gap_closure: false
---

# Plan 75.4: Static Verification, Full Test Suite, and Production Build Check

## Objective
Melakukan verifikasi menyeluruh terhadap seluruh codebase proyek SIMKOP untuk memastikan penambahan utilitas penomoran kwitansi anti-bentrok, integrasi modal bukti pelunasan pinjaman, dan pembaruan service layer tidak menyebabkan regresi apapun. Memvalidasi bahwa seluruh suite pengujian otomatis lulus 100% dan proses bundling produksi Vite berhasil dengan kode status 0 tanpa error tipe TypeScript.

## Context
Load these files for context:
- `src/utils/receiptGenerator.ts`
- `src/components/loans/LoanScheduleModal.tsx`
- `src/services/loanMatrixService.ts`

## Tasks

<task type="auto">
  <name>Run Full Unit Test Suite and Lint Checks</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh test suite Vitest:
       ```bash
       npx vitest run
       ```
    2. Pastikan tidak ada kegagalan test pada modul pinjaman, ekspor kuitansi, maupun modul-modul lain di SIMKOP.
  </action>
  <verify>
    npx vitest run
  </verify>
  <done>
    Seluruh file test (60+ file test) lulus tanpa kegagalan.
  </done>
</task>

<task type="auto">
  <name>Verify TypeScript Compilation and Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan build produksi Vite untuk memverifikasi tipe TypeScript dan integritas bundler:
       ```bash
       npm run build
       ```
    2. Pastikan build menghasilkan direktori `dist/` tanpa ada error tipe atau warning fatal.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Vite build berhasil dengan exit code 0.
  </done>
</task>

## Success Criteria
- [ ] Seluruh unit test proyek berjalan dan lulus 100%.
- [ ] `npm run build` selesai tanpa error dan aplikasi siap dirilis ke produksi.
