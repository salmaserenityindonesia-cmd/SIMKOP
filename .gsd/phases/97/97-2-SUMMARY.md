---
phase: 97
plan: 2
completed_at: 2026-11-25T20:19:00+07:00
duration_minutes: 7
---

# Summary: Plan 97.2 — Backfill Idempoten Kwitansi Migrasi, Pembersihan Duplikasi Gelondongan & Guard Tanggal Lunas di `paidOffLoansReportService.ts`

## Results
- 2 tasks completed
- All verifications passed (23/23 Vitest tests in `src/pages/admin/LaporanPinjamanLunas.test.tsx` + `npx tsc --noEmit` exit code 0)

## Tasks Completed
| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Implement Idempotent Migration Repayment Backfill (No CashFlow) and Future Payoff Date Clamping | 40476e09 | ✅ |
| 2 | Add Unit Tests for Idempotent Backfill, In-Flight Lock, Legacy Cleanup, and Date Clamping | 8886e3e1 | ✅ |

## Deviations Applied
None — executed as planned.

## Files Changed
- `src/services/paidOffLoansReportService.ts` - Added `getLocalTodayYmd` and `clampIsoOrYmdToToday` helpers; added idempotent `syncMissingMigrationRepaymentsForSettledSchedules` with module-level `migrationRepaymentBackfillLock` (released in `finally`) invoked at the start of `getPaidOffLoansReport`; queries settled `loan_schedules` (`paid_amount > 0` or `status = 'paid'`) via `fetchAllPaginatedSafe` safely exiting when mocks lack `.or()`, fetches chunked `loans` metadata and existing `loan_repayments` (with column fallback if `receipt_number` does not exist), batch-inserts missing `SALDO_AWAL_MIGRASI` (`KW-MIGRASI/{loanNumber}/B{periodNumber}`) rows without writing to `public.cash_flow`, deletes redundant legacy `SALDO_AWAL` / `migrasi_awal` lump-sum rows via `filterRedundantLegacySaldoAwalRepayments`, and clamps `paidOffDate` in `getPaidOffLoansReport` via `clampIsoOrYmdToToday` before computing `paidOffYear`.
- `src/pages/admin/LaporanPinjamanLunas.test.tsx` - Kept all 18 existing tests passing and added 5 unit tests covering: auto-backfill of `SALDO_AWAL_MIGRASI` receipts with `payment_date <= today` and 0 `cash_flow` calls, cleanup of redundant `SALDO_AWAL` / `migrasi_awal` rows without double counting, concurrency deduplication via `Promise.all` in-flight lock plus sequential re-call idempotency, future `payment_date` and fallback `due_date` (`2026-12-01`) clamping to `2026-11-25` (`25 Nov 2026` instead of `1 Des 2026`), and missing `receipt_number` column schema fallback (`PGRST204`/`42703`).

## Verification
- `npx vitest run src/pages/admin/LaporanPinjamanLunas.test.tsx`: ✅ Passed (23/23 tests: 18 existing + 5 new)
- `npx tsc --noEmit`: ✅ Passed (exit code 0)
