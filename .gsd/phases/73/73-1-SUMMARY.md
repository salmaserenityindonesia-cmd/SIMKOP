# Plan 73.1 Summary: Rolling 12-Month Window & Carry-Forward Ledger Engine

## Executed Tasks
1. **Define MonthPeriod and getRolling12Months Generator in complianceService.ts** (`4062c8cb`)
   - Defined `MonthPeriod` interface containing `year`, `month` (1-12), `label` ('Bln-YY'), and `periodIndex` (`year * 12 + month`).
   - Implemented and exported generator function `getRolling12Months(refYear: number, refMonth: number): MonthPeriod[]` returning exactly 12 continuous chronological periods ending at `refMonth`.
   - Updated TypeScript interfaces (`ComplianceMonthData`, `ComplianceMatrixRow`, `ComplianceMatrixResult`) with `openingBalance`, `periods`, `windowStartIndex`, `cum_w`, `cum_b`, `cum_l`, and `isOpeningBalanceMonth`.

2. **Implement Rolling Window Ledger & Opening Balance Accumulator in getComplianceMatrixData** (`09c5fe3a`)
   - Expanded function signature to `getComplianceMatrixData(yearOrRolling?: number | string, depositType?: string, refMonth?: number)`.
   - Resolved rolling vs calendar window modes cleanly based on parameters.
   - Aggregated all historical member deposits and withdrawals prior to `windowStartIndex` into member `openingBalance` (`w`, `b`, `l`).
   - Chained running cumulative balance (`runningCumW`, `runningCumB`, `runningCumL`) starting from opening balance in column 0 and accumulating monthly deposits/withdrawals across the 12 periods.
   - Attached `openingBalance` and `periods` to `ComplianceMatrixRow` and `ComplianceMatrixResult`.

## Verification Evidence
- TypeScript compile check: `npx tsc --noEmit` exited cleanly with code 0.
- Service test suite: `npm test src/services/complianceService.test.ts` passed 33/33 tests.
- Full workspace test suite: `npm test` passed 59/59 test files and 810/810 tests.

## Commits
- `4062c8cb feat(phase-73): define MonthPeriod and getRolling12Months generator`
- `09c5fe3a feat(phase-73): implement rolling window ledger and opening balance accumulator`
