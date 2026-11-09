# Plan 71.1: Support 'POKOK' in savingsRateService.ts & PengaturanKoperasi.tsx Summary

## Execution Overview
Plan 71.1 successfully implemented Simpanan Pokok (`POKOK`) support in both the savings rate tier service layer and the Pengaturan Koperasi management UI.

## Key Changes Completed
1. **Savings Rate Service (`src/services/savingsRateService.ts`)**:
   - Expanded type definitions: `DepositTypeCode = 'POKOK' | 'WAJIB' | 'BELANJA' | 'LEBARAN'` and added `DEPOSIT_TYPE_LABELS`.
   - Added initial seed tier for Simpanan Pokok (`seed-pokok-tier-1`, start_year: 2024, start_month: 1, open-ended, monthly_rate: 100,000).
   - Updated `getApplicableRate` with fallback support for `'POKOK'` and `'SP'` (100,000 IDR) and alias handling.
   - Updated `getActiveSavingsRateTiers` to include `'POKOK'` in the query set, with alias mappings `'SP' -> 'POKOK'`, including offline fallback.
   - Updated unit test assertions in `src/services/savingsRateService.test.ts`.

2. **Pengaturan Koperasi Page & Tests (`src/pages/admin/PengaturanKoperasi.tsx` & `.test.tsx`)**:
   - Updated `getDepositTypeBadge` to render a blue badge (`bg-blue-50 text-blue-700 border-blue-200`) labeled `'Simpanan Pokok'` for `'POKOK'` / `'SP'`.
   - Added `<option value="POKOK">Simpanan Pokok</option>` in the "Tambah Kenaikan Tarif Simpanan" modal dropdown.
   - Added dynamic label ("Nominal Simpanan Pokok Baru (Rp) *") and placeholder ("Contoh: 100000") when Simpanan Pokok is selected in the modal.
   - Added `(Sekali Bayar / Awal)` subtitle note beneath the nominal in the rate tier table for Simpanan Pokok rows.
   - Updated and expanded unit tests in `src/pages/admin/PengaturanKoperasi.test.tsx` (all 13 tests passing).

## Verification Results
- `npx tsc --noEmit`: Exited with code 0 (clean typecheck)
- `npx vitest run src/services/savingsRateService.test.ts`: 21 passed (21 total)
- `npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx`: 13 passed (13 total)

## Commits Landed
- `98d2496b`: `feat(phase-71): expand savings rate tier code type and helpers to support Simpanan Pokok`
- `3175caa7`: `feat(phase-71): update modal form, table display, and tests for Simpanan Pokok in PengaturanKoperasi`
