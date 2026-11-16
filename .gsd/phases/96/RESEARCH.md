---
phase: 96
status: complete
discovery_level: 1
---

# Phase 96 Research: Konsolidasi & Simulasi Tenor Angsuran Bon Toko + Buku Bantu Angsuran

## Key Codebase Findings (Verified Against Source Files)

1. **POS Payment Modal File Location**:
   - Route `/admin/kasir` in `src/App.tsx` renders `POSPage` (`src/pages/pos/index.tsx`), **not** `src/pages/admin/Kasir.tsx`.
   - The payment modal used by `src/pages/pos/index.tsx` is `src/components/pos/SplitPaymentModal.tsx` (which already contains `"Catat Bon Toko (Potong Gaji)"` and `"Konfirmasi & Cetak Struk"`). There is no `PaymentModal.tsx`.

2. **Supabase Migration Sequence**:
   - `supabase/migrations/` already contains `043_create_atomic_loan_transactions_rpc.sql` through `051_add_loan_topup_columns.sql`.
   - Therefore, the new migration must be numbered `supabase/migrations/052_create_store_credit_installments.sql` (not `043_...`).
   - Use `DROP POLICY IF EXISTS` before `CREATE POLICY` for idempotency and end with `NOTIFY pgrst, 'reload schema';`.

3. **`store_credit_payments` Table Schema (`038_create_store_credit_payments_table.sql`)**:
   - Columns are strictly: `id`, `sale_id`, `amount`, `payment_date`, `receipt_number`, `notes`, `created_by`, `created_at`.
   - There is **no** `member_id` column on `store_credit_payments`.
   - `settleStoreCredit()` in `src/services/storeCreditLedgerService.ts` already handles FIFO allocation across open `sales` for a `memberId`, inserts valid columns into `store_credit_payments`, and logs `cash_flow` for `'tunai'` payments. Reusing `settleStoreCredit()` inside `payStoreCreditSchedule()` keeps `BukuBesarBonToko` ledger balances and `store_credit_payments` 100% consistent.

4. **`processCheckout` RPC Early Return & Double-Counting Prevention (`src/services/posCheckoutService.ts`)**:
   - `processCheckout()` currently returns early at lines 138–144 when `supabase.rpc('process_pos_checkout', ...)` succeeds, before reaching fallback mutations.
   - Calling `createOrTakeoverStoreCreditPlan()` only in the fallback branch would skip plan creation in production when the RPC is active.
   - Furthermore, querying `getMemberUnpaidStoreCreditSummary(memberId)` *after* inserting the new `sales` row would cause `getMemberActiveDebt()` to include the brand-new sale when no prior plan exists, double-counting `newCreditAmount`.
   - **Solution**: Capture `getMemberUnpaidStoreCreditSummary(memberId)` **before** executing the RPC or fallback `sales` insert, capture `{ saleId, saleNumber }` from whichever checkout path succeeds, and then invoke `createOrTakeoverStoreCreditPlan()` once `saleId` is known.

5. **Isolation from Loans (`/admin/loan-matrix` & `public.loans`)**:
   - All store credit plans and schedules live exclusively in `public.store_credit_installment_plans` and `public.store_credit_schedules`.
   - Zero writes or references to `public.loans` or `public.loan_schedules`.
