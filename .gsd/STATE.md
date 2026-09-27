## Current Position
- **Phase**: 8 (Konfigurasi & Fleksibilitas Simpan Pinjam Dinamis)
- **Task**: Plan 8.4 complete. Ready for Plan 8.5 (Dashboard Analytics).
- **Status**: Active (resumed 2026-09-27 11:33)

## Last Session Summary
Executed Plan 8.4 inline. Successfully migrated `ajukanPinjaman` and related services in `koperasiService.ts` to use the new `loans` table. Updated `FormPengajuanPinjaman.tsx` to handle dynamic loan types and correct tenor validation. Refactored `ApprovalPinjaman.tsx` to read the new `Loan` interface properties. Completely rewrote `DetailPinjaman.tsx` to dynamically render an installment schedule that integrates partial payments using the `monthly_loan_commitments` view and `addLoanInstallment` API. Passed build tests successfully.

## In-Progress Work
N/A - Plan 8.4 is complete and clean.

## Blockers
None.

## Context Dump

### Decisions Made
- **Generating Schedule Dynamically**: Since the `monthly_loan_commitments` view only returns rows for months that have recorded transactions, we cannot rely on it to list all months of a loan. We generate the schedule loop based on `agreed_tenor_months` in `DetailPinjaman.tsx` and overlay the query result.
- **`Pinjaman` -> `Loan` migration**: Updated legacy references of `Pinjaman` inside `koperasiService.ts` to directly use `Loan` so that the app correctly interacts with the new dynamic `loans` table.

### Files of Interest
- `src/services/koperasiService.ts`: Core data fetching; updated functions for `loans`.
- `src/pages/admin/DetailPinjaman.tsx`: Handles partial loan installment payments.
- `src/components/admin/FormPengajuanPinjaman.tsx`: Reads dynamic loan types for submissions.

## Next Steps
1. Execute Plan 8.5 (Dashboard Analytics) to display tracking status of monthly commitments.
2. Verify Phase 8.
3. Wrap up project or continue to optional deferred tasks.
