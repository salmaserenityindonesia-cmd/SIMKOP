---
phase: 53
plan: 4
wave: 4
depends_on:
  - 53.1
  - 53.2
  - 53.3
gap_closure: false
---

# Plan 53.4: Static Verification, Full Vitest Suite & Production Build

## Objective
Melakukan verifikasi mutu menyeluruh terhadap implementasi ekspor dan impor matriks buku besar simpanan, meliputi pemeriksaan tipe statis TypeScript (`tsc --noEmit`), eksekusi seluruh suite pengujian unit dan komponen Vitest tanpa regresi, serta validasi build bundler produksi Vite (`npm run build`).

## Context
- `src/utils/savingsMatrixExporter.ts`
- `src/utils/savingsMatrixImporter.ts`
- `src/services/complianceService.ts`
- `src/components/compliance/SavingsMatrixImportModal.tsx`
- `src/pages/admin/ComplianceMatrix.tsx`

## Tasks

<task type="auto">
  <name>Run Full TypeScript Type Check and Vitest Suite</name>
  <files>
    src/utils/savingsMatrixExporter.ts
    src/utils/savingsMatrixImporter.ts
    src/services/complianceService.ts
    src/components/compliance/SavingsMatrixImportModal.tsx
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Jalankan pemeriksaan tipe TypeScript non-emitting:
       `npm run typecheck`
       Pastikan tidak ada galat tipe data (`any` yang tidak valid, missing optional properties, unhandled null/undefined).
    2. Jalankan seluruh suite pengujian Vitest di repository:
       `npm test`
       Pastikan seluruh test file (termasuk unit tests baru dan tes komponen yang sudah ada) lulus 100%.
  </action>
  <verify>
    npm run typecheck && npm test
  </verify>
  <done>
    Typecheck bersih tanpa error dan seluruh tes unit Vitest lulus tanpa regresi.
  </done>
</task>

<task type="auto">
  <name>Verify Production Vite Build</name>
  <files>
    dist/
  </files>
  <action>
    1. Jalankan build bundler produksi:
       `npm run build`
    2. Periksa output bundler untuk memastikan:
       - Tidak ada modul yang hilang atau sirkular dependency.
       - Dynamic import untuk library ExcelJS terpecah (chunking) secara optimal.
       - Exit code bernilai 0.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Build produksi Vite selesai dengan sukses (exit code 0).
  </done>
</task>

## Success Criteria
- [ ] `npm run typecheck` selesai tanpa error (exit code 0).
- [ ] Seluruh test file Vitest lulus 100%.
- [ ] `npm run build` berhasil menghasilkan bundle produksi yang siap digunakan.

