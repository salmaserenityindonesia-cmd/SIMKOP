---
phase: 97
plan: 1
completed_at: 2026-11-25T20:12:00+07:00
duration_minutes: 3
---

# Summary: Plan 97.1 — Guard Tanggal Pembayaran (<= Today) & Invarian Status/Kwitansi pada Mesin Impor Excel Saldo Awal Pinjaman

## Results
- 2 tasks completed
- All verifications passed (65/65 Vitest tests across 2 test suites + `tsc --noEmit` exit code 0)

## Tasks Completed
| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Clamp Future Payment/CashFlow Dates to Today in syncInitialLoanBalances | 96ca88ca | ✅ |
| 2 | Add Regression Unit Tests for Future Date Clamping on Excel Loan Import | 9c545f3f | ✅ |

## Deviations Applied
None — executed as planned.

## Files Changed
- `src/services/loanService.ts` - Added `isValidYmdString` and `clampToTodayYmd` helpers; clamped `loan_repayments.payment_date` and `cash_flow.created_at` in `syncInitialLoanBalances` to `<= todayDate` (`formatDateYmd(new Date())`) while keeping `loan_schedules.due_date`, clean overwrite, `paid_off` vs `active` contract status, and per-period `KW-MIGRASI/{loanNumber}/B{period}` receipts (`SALDO_AWAL_MIGRASI`) intact.
- `src/utils/initialLoansParser.test.ts` - Added regression unit test using `vi.useFakeTimers()` (`2026-11-25T10:00:00+07:00`) proving a 6-month loan starting `2026-06-01` keeps `loan_schedules[5].due_date === '2026-12-01'`, clamps `loan_repayments[5].payment_date` and `cash_flow[5].created_at` to `'2026-11-25T08:00:00.000Z'`, sets contract status to `'paid_off'`, and emits no `SALDO_AWAL` lump-sum row.

## Verification
- `npx vitest run src/utils/initialLoansParser.test.ts`: ✅ Passed (11/11 tests)
- `npx vitest run src/utils/initialLoansParser.test.ts src/services/loanService.test.ts`: ✅ Passed (65/65 tests: 54 in `loanService.test.ts`, 11 in `initialLoansParser.test.ts`)
- `npm run typecheck` (`tsc --noEmit`): ✅ Passed (exit code 0)
