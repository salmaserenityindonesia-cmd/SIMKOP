---
phase: 84
plan: 3
wave: 3
gap_closure: false
---

# Plan 84.3: Static Verification, Full Test Suite, and Production Build

## Objective
Melakukan verifikasi komprehensif melalui pemeriksaan tipe TypeScript (`tsc --noEmit`), eksekusi seluruh unit test (`vitest run`), dan validasi build bundler Vite (`npm run build`) untuk memastikan tidak ada regresi atau kesalahan sintaks/tipe pada seluruh proyek sebelum dinyatakan selesai.

## Context
Load these files for context:
- src/services/withdrawalReportService.ts
- src/pages/admin/LaporanPenarikanSimpanan.tsx
- src/services/withdrawalReportService.test.ts
- src/pages/admin/LaporanPenarikanSimpanan.test.tsx

## Tasks

<task type="auto">
  <name>Full Test Suite and Production Build Verification</name>
  <files>src/</files>
  <action>
    - Jalankan pemeriksaan tipe TypeScript: `npx tsc --noEmit`.
    - Jalankan seluruh suite unit test: `npx vitest run`.
    - Jalankan build produksi: `npm run build`.
    - Pastikan tidak ada peringatan atau error yang mematahkan pipeline build.
  </action>
  <verify>
    Periksa keluaran terminal:
    1. `npx tsc --noEmit` keluar dengan exit code 0 tanpa error tipe.
    2. `npx vitest run` seluruh test file passing (exit code 0).
    3. `npm run build` berhasil menghasilkan bundle di `dist/` (exit code 0).
  </verify>
  <done>
    Seluruh sistem terverifikasi stabil, bebas error TypeScript, dan bundle produksi sukses dibuild.
  </done>
</task>

## Must-Haves
- [ ] `npx tsc --noEmit` sukses 0 error.
- [ ] Seluruh unit test Vitest lulus.
- [ ] `npm run build` sukses 0 error.

## Success Criteria
- [ ] Build produksi Vite berhasil dan siap dideploy tanpa regresi fungsional.

