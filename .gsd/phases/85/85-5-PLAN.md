---
phase: 85
plan: 5
wave: 5
gap_closure: false
---

# Plan 85.5: Static Verification, Full Test Suite, and Production Build

## Objective
Menjalankan pengujian akhir yang komprehensif pada keseluruhan proyek SIMKOP: validasi tipe TypeScript (`tsc --noEmit`), eksekusi rangkaian unit test Vitest, dan build produksi Vite (`npm run build`) untuk menjamin zero-regression dan kestabilan penuh fitur pencairan massal simpanan lebaran.

## Context
Load these files for context:
- src/services/bulkWithdrawalService.ts
- src/pages/admin/penarikan-simpanan/index.tsx
- src/services/savingsMatrixService.ts

## Tasks

<task type="auto">
  <name>Comprehensive Static Verification and Production Build</name>
  <files>src/</files>
  <action>
    - Jalankan type checking TypeScript:
      `npx tsc --noEmit`
      Perbaiki setiap inkonsistensi tipe data atau linting error jika ditemukan.
    - Jalankan seluruh rangkaian unit test Vitest:
      `npx vitest run`
      Pastikan semua file test lulus (termasuk test baru untuk `bulkWithdrawalService` dan `savingsMatrixService`).
    - Jalankan build produksi Vite:
      `npm run build`
      Pastikan exit code 0 dan berkas bundel berhasil di-generate di folder `dist/`.
  </action>
  <verify>
    Seluruh perintah verifikasi keluar dengan return code 0 tanpa pesan error fatal atau kegagalan kompilasi.
  </verify>
  <done>
    Fitur pencairan massal simpanan lebaran diverifikasi 100% stabil, siap rilis ke lingkungan produksi.
  </done>
</task>

## Must-Haves
- [ ] TypeScript check `tsc --noEmit` lulus dengan exit code 0.
- [ ] Rangkaian unit test Vitest lulus 100% (0 failing tests).
- [ ] Vite build produksi berhasil meng-generate bundle di folder `dist/`.

## Success Criteria
- [ ] Zero build warnings yang memblokir produksi.
- [ ] Kesiapan produksi terjamin secara empiris.

