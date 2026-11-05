---
phase: 59
plan: 3
wave: 3
depends_on: [2]
gap_closure: false
---

# Plan 59.3: Static Verification, Comprehensive Test Suite & Production Build Verification

## Objective
Melakukan static type checking (`tsc --noEmit`), menjalankan seluruh rangkaian unit test Vitest (termasuk POS checkout, split payment, dan cashier shift), serta memverifikasi bundler produksi (`npm run build`) untuk memastikan integrasi simpanan belanja di kasir berjalan stabil dan bebas regresi.

## Context
- `src/`
- `.gsd/phases/59/59-1-PLAN.md`
- `.gsd/phases/59/59-2-PLAN.md`

## Tasks

<task type="auto">
  <name>Comprehensive Verification & Production Build</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan TypeScript compiler check:
       `npx tsc --noEmit`
    2. Jalankan targeted test suite modul POS & Shift:
       `npx vitest run src/services/posCheckoutService.test.ts src/components/pos/SplitPaymentModal.test.tsx src/services/cashierShiftService.test.ts`
    3. Jalankan full test suite proyek:
       `npx vitest run`
    4. Jalankan production build Vite:
       `npm run build`
    5. Dokumentasikan hasil verifikasi dan buat `VERIFICATION.md` untuk Phase 59.
  </action>
  <verify>
    Kompilasi TypeScript dan build produksi Vite selesai dengan exit code 0 tanpa error.
  </verify>
  <done>
    Seluruh sistem terverifikasi stabil, bersih dari regresi, dan siap dioperasikan.
  </done>
</task>

## Success Criteria
- [ ] `tsc --noEmit` exit code 0 tanpa error tipe.
- [ ] Seluruh unit test terkait lulus 100%.
- [ ] Vite production build selesai dengan exit code 0.
- [ ] Laporan `VERIFICATION.md` mencatat bukti empiris pengujian.
