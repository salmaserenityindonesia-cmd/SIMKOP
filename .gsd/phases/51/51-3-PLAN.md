---
phase: 51
plan: 3
wave: 3
depends_on:
  - 51.1
  - 51.2
gap_closure: false
---

# Plan 51.3: Static Verification, Full Vitest Suite & Production Build Check

## Objective
Melakukan verifikasi komprehensif terhadap seluruh basis kode SIMKOP: menjalankan pengujian statis TypeScript (`tsc --noEmit`), menjalankan seluruh suite unit test Vitest (termasuk modul simpanan, kepatuhan, dan POS), serta memverifikasi bahwa build produksi Vite selesai dengan exit code 0 tanpa error ataupun peringatan fatal.

## Context
- `src/services/savingsMatrixService.ts`
- `src/services/savingsMatrixService.test.ts`
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `package.json`

## Tasks

<task type="auto">
  <name>Run TypeScript Typecheck & Full Vitest Test Suite</name>
  <files>
    src/services/savingsMatrixService.ts
    src/services/savingsMatrixService.test.ts
    src/pages/admin/ComplianceMatrix.tsx
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Jalankan pemeriksaan tipe TypeScript statis:
       `npx tsc --noEmit`
    2. Pastikan tidak ada type error atau unresolved imports.
    3. Jalankan pengujian unit Vitest penuh pada seluruh berkas test dalam proyek:
       `npx vitest run`
    4. Pastikan 100% test files dan unit tests lulus tanpa regresi.
  </action>
  <verify>
    Perintah `npx tsc --noEmit` dan `npx vitest run` selesai dengan exit code 0.
  </verify>
  <done>
    Seluruh pengujian unit lulus 100% dan analisis tipe TypeScript bebas dari kesalahan.
  </done>
</task>

<task type="auto">
  <name>Verify Production Build</name>
  <files>
    package.json
  </files>
  <action>
    1. Jalankan build produksi menggunakan script bundler Vite:
       `npm run build`
    2. Periksa output bundler di direktori `dist/` terbuat dengan baik tanpa missing chunks atau syntax issues.
  </action>
  <verify>
    Perintah `npm run build` selesai dengan exit code 0.
  </verify>
  <done>
    Aplikasi berhasil di-bundle untuk produksi dan siap dideploy tanpa kendala.
  </done>
</task>

## Success Criteria
- [ ] Analisis statis TypeScript `tsc --noEmit` selesai tanpa error.
- [ ] Seluruh suite unit test Vitest lulus 100%.
- [ ] Build produksi `npm run build` selesai dengan exit code 0.

