# Plan 8.5 Summary

## Objective
Enhance the Admin Dashboard to show metrics derived from the new monthly tracking views.

## Work Done
- Added `getCommitmentStats` in `koperasiService.ts` to query `monthly_deposit_commitments` and `monthly_loan_commitments`.
- Refactored `AdminDashboard.tsx` to fetch the commitment stats.
- Added a new UI section in `AdminDashboard.tsx` to display 'Lunas' and 'Belum Lunas' counts for deposits and loans.

## Verification
- Dashboard renders correctly with commitment stats
- Build passes
