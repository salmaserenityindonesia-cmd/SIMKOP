---
phase: 31
plan: 3
wave: 3
gap_closure: false
---

# Plan 31.3: Wave 3 - Build Verification, Unit Testing & Static Check

## Objective
Memverifikasi integritas tipe TypeScript secara menyeluruh, menjalankan seluruh suite pengujian unit Vitest (termasuk pengujian komponen baru `ProductSearchAutocomplete`), dan memastikan kompilasi bundle produksi Vite berhasil 100% tanpa error.

## Context
Load these files for context:
- src/components/common/ProductSearchAutocomplete.tsx
- src/components/common/ProductSearchAutocomplete.test.tsx
- src/pages/admin/ManajemenPembelian.tsx

## Tasks

<task type="auto">
  <name>Build Verification & Type Integrity</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan typechecking TypeScript:
       `npm run typecheck`
    2. Jalankan seluruh suite unit test Vitest:
       `npx vitest run`
    3. Jalankan build produksi Vite:
       `npm run build`
    4. Pastikan tidak ada error kompilasi, peringatan fatal, atau regresi fungsional pada modul ManajemenPembelian.
  </action>
  <verify>
    npm run build && npx vitest run
  </verify>
  <done>
    TypeScript typechecking, vitest test suite, dan Vite production build lulus 100% dengan exit code 0.
  </done>
</task>

## Success Criteria
- [ ] `npm run typecheck` lulus tanpa error tipe.
- [ ] Seluruh unit tests di Vitest lulus 100% (termasuk tes komponen `ProductSearchAutocomplete`).
- [ ] Build produksi Vite (`npm run build`) berhasil dengan exit code 0.
