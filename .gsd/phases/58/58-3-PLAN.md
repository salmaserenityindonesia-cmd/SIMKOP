---
phase: 58
plan: 3
wave: 3
depends_on: [2]
gap_closure: false
---

# Plan 58.3: Static Analysis, Full Test Suite & Production Build Verification

## Objective
Menjalankan audit static analysis penuh, type check TypeScript (`tsc --noEmit`), seluruh rangkaian unit test Vitest, serta validasi bundler produksi (`npm run build`) untuk memastikan integrasi fitur bukti setoran dan jejak audit bebas regresi.

## Context
- `src/`
- `.gsd/phases/58/58-1-PLAN.md`
- `.gsd/phases/58/58-2-PLAN.md`

## Tasks

<task type="auto">
  <name>Comprehensive Verification & Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan TypeScript compiler check untuk memvalidasi ketiadaan error tipe:
       `npx tsc --noEmit`
    2. Jalankan seluruh test suite Vitest pada modul kepatuhan dan matriks simpanan:
       `npx vitest run src/services/savingsMatrixService.test.ts src/components/compliance/SavingsLedgerMatrixModal.test.tsx src/pages/admin/ComplianceMatrix.test.tsx`
    3. Jalankan full test suite proyek:
       `npx vitest run`
    4. Jalankan production build Vite:
       `npm run build`
    5. Dokumentasikan hasil verifikasi dan buat `VERIFICATION.md` untuk Phase 58.
  </action>
  <verify>
    npm run build berakhir dengan exit code 0 tanpa error TypeScript atau kompilasi bundler.
  </verify>
  <done>
    Seluruh sistem terverifikasi stabil, bersih dari regresi, dan siap dioperasikan.
  </done>
</task>

## Success Criteria
- [ ] `tsc --noEmit` bersih tanpa error tipe (exit code 0).
- [ ] Seluruh unit test terkait lulus 100%.
- [ ] Vite production build selesai dengan exit code 0.
- [ ] Dokumen `VERIFICATION.md` mencatat bukti empiris pengujian.

