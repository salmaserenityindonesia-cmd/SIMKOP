---
phase: 50
plan: 4
wave: 4
depends_on: ["50-1", "50-2", "50-3"]
gap_closure: false
---

# Plan 50.4: Static Verification, Full Vitest Suite & Production Build Check

## Objective
Melakukan verifikasi komprehensif terhadap seluruh basis kode untuk menjamin tidak terjadi regresi: menjalankan seluruh rangkaian pengujian unit dan komponen Vitest, melakukan pemeriksaan tipe statis TypeScript (`tsc --noEmit`), serta memastikan build produksi Vite (`npm run build`) berhasil dengan exit code 0.

## Context
- `package.json`
- `tsconfig.json`
- `vite.config.ts`

## Tasks

<task type="auto">
  <name>Run Full Vitest Workspace Suite</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan seluruh rangkaian test Vitest di seluruh workspace SIMKOP:
       `npx vitest run`
    2. Pastikan tidak ada kegagalan (0 failed tests), termasuk pengujian baru untuk:
       - `savingsRateService.test.ts`
       - `PengaturanKoperasi.test.tsx`
       - `SavingsLedgerMatrixModal.test.tsx`
       - `ComplianceMatrix.test.tsx`
    3. Jika terdapat peringatan atau kegagalan asersi, segera lakukan investigasi dan perbaikan.
  </action>
  <verify>
    Eksekusi `npx vitest run` menghasilkan exit code 0 dan 100% tests passed.
  </verify>
  <done>
    Seluruh rangkaian pengujian Vitest lolos tanpa ada regresi.
  </done>
</task>

<task type="auto">
  <name>Verify TypeScript Typecheck and Vite Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan type checking statis TypeScript:
       `npx tsc --noEmit`
    2. Jalankan build produksi Vite:
       `npm run build`
    3. Pastikan tidak ada kesalahan tipe data TypeScript atau error bundler Vite saat menghasilkan berkas distribusi produksi di direktori `dist/`.
  </action>
  <verify>
    Kedua perintah `npx tsc --noEmit` dan `npm run build` selesai dengan exit code 0 tanpa error.
  </verify>
  <done>
    Build produksi terverifikasi bersih dan siap rilis.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] 100% Vitest test suite lulus tanpa kegagalan.
- [ ] TypeScript typecheck lolos dengan 0 kesalahan tipe.
- [ ] `npm run build` menghasilkan bundle produksi yang valid di `dist/` dengan status exit code 0.

## Success Criteria
- [ ] All tasks verified passing
- [ ] No regressions in tests
- [ ] Clean build artifacts

