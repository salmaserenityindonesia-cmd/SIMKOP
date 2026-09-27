---
phase: 8
plan: 1
wave: 1
depends_on: []
files_modified:
  - src/services/koperasiService.ts
autonomous: true
must_haves:
  truths:
    - "Service layer uses the new Supabase English-named schema tables for deposits and loans"
  artifacts:
    - "src/services/koperasiService.ts"
---

# Plan 8.1: Migrasi Skema Database & Update Service Layer

<objective>
Refactor `koperasiService.ts` to use the English-named tables (`deposit_types`, `member_deposits`, `deposit_transactions`, `loan_types`, `loans`, `loan_installments`) that exist in the Supabase schema, instead of the old dummy implementation (`simpanan`, `angsuran`, `pinjaman`).

Purpose: Ensure the application communicates with the actual dynamic tables that support flexible product configuration and partial payments.
Output: Updated service functions with correct typing and queries.
</objective>

<context>
Load for context:
- .gsd/SPEC.md
- .gsd/PHASE-8-PROPOSAL.md
- src/services/koperasiService.ts
</context>

<tasks>

<task type="auto">
  <name>Update Types for Deposits and Loans</name>
  <files>src/services/koperasiService.ts</files>
  <action>
    Define or update TypeScript interfaces matching the Supabase schema:
    - `DepositType` (id, code, name, frequency_type, default_amount, can_be_withdrawn, is_active)
    - `MemberDeposit` (id, member_id, deposit_type_id, is_terminated)
    - `DepositTransaction` (id, member_deposit_id, transaction_type, amount, for_month, for_year)
    - `LoanType` (id, code, name, max_duration_months, is_active)
    - `Loan` (id, loan_number, member_id, loan_type_id, principal_amount, agreed_tenor_months, planned_installment_amount, status)
    - `LoanInstallment` (id, loan_id, amount, payment_date, for_month, for_year)
    AVOID: Keeping the old `Simpanan`, `Angsuran`, `Pinjaman` types if they conflict, but ensure UI compatibility if possible, or mark them for refactoring in later plans.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Types are correctly defined and exported.</done>
</task>

<task type="auto">
  <name>Refactor CRUD Functions for Deposits and Loans</name>
  <files>src/services/koperasiService.ts</files>
  <action>
    Create/Update functions to interact with the new tables.
    - `getDepositTypes`, `getLoanTypes`
    - `getMemberDeposits(memberId)`
    - `getLoans(memberId)`
    - `addDepositTransaction(...)`
    - `addLoanInstallment(...)`
    - `getMonthlyDepositCommitments(memberId)` -> query the `monthly_deposit_commitments` View
    - `getMonthlyLoanCommitments(memberId)` -> query the `monthly_loan_commitments` View
    AVOID: Breaking existing `getAnggotaWithSimpanan()` immediately without a bridge; provide a backward-compatible adapter if possible, or update it to aggregate using `monthly_deposit_commitments`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>Functions are implemented and type-check passes.</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] TypeScript compiler passes without errors.
- [ ] Service layer correctly maps to the Supabase views and tables.
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>
