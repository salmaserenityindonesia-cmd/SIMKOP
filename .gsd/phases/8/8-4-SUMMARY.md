# Plan 8.4 Summary

## Objective
Update the Loan flow to use the dynamic `loans` table.

## Work Done
- Updated `ajukanPinjaman`, `getPendingPinjaman`, `updateStatusPinjaman`, and `getPinjamanById` in `koperasiService.ts` to use the `loans` table.
- Updated `getMonthlyLoanCommitments` to accept an options filter `{ loanId: string }`.
- Refactored `FormPengajuanPinjaman.tsx` to use dynamic dropdown for `loan_type_id` and validate max tenor.
- Refactored `ApprovalPinjaman.tsx` to properly read `Loan` interface properties.
- Refactored `DetailPinjaman.tsx` to use `monthly_loan_commitments` view to support dynamic monthly schedules and partial installments.

## Verification
- Form renders correctly with dynamic loans
- Detail schedule calculates correctly
- Build passes
