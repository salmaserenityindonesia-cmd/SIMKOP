---
phase: 32
plan: 4
wave: 4
gap_closure: false
---

# Plan 32.4: Wave 4 - Static Verification, Unit Testing & Production Build

## Objective
Memverifikasi integritas tipe TypeScript secara komprehensif, menjalankan seluruh suite pengujian unit Vitest (termasuk unit test service retur pembelian), dan memastikan kompilasi bundle produksi Vite berhasil 100% tanpa error maupun regresi.

## Context
Load these files for context:
- src/services/purchaseReturnService.ts
- src/services/purchaseReturnService.test.ts
- src/pages/admin/ManajemenReturPembelian.tsx
- src/pages/admin/InputReturPembelian.tsx
- src/App.tsx

## Tasks

<task type="auto">
  <name>Comprehensive Unit Tests and Type Integrity</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan static type checking:
       `npm run typecheck`
    2. Jalankan seluruh suite unit test Vitest:
       `npx vitest run`
    3. Pastikan seluruh pengujian unit baru pada `purchaseReturnService.test.ts` dan seluruh test suites sebelumnya (14+ suites) lulus 100%.
  </action>
  <verify>
    npm run typecheck && npx vitest run
  </verify>
  <done>
    TypeScript type checking dan seluruh suite pengujian unit lulus tanpa kegagalan.
  </done>
</task>

<task type="auto">
  <name>Production Build Validation</name>
  <files>
    dist/
  </files>
  <action>
    1. Jalankan bundling produksi:
       `npm run build`
    2. Pastikan file output HTML, CSS, dan JS berhasil di-bundle ke direktori `dist/` tanpa circular dependency atau unresolvable module error.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Build produksi Vite selesai sukses dengan exit code 0.
  </done>
</task>

## Success Criteria
- [ ] `npm run typecheck` lulus 100% tanpa error tipe.
- [ ] Seluruh suite pengujian unit Vitest lulus tanpa error.
- [ ] Build produksi Vite (`npm run build`) berhasil dengan exit code 0.
