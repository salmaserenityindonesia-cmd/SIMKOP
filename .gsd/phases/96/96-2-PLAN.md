---
phase: 96
plan: 2
wave: 2
depends_on:
  - 96.1
gap_closure: false
---

# Plan 96.2: Implement Unpaid Store Credit Lookup, Tenor Takeover Engine & POS Checkout Integration

## Objective
Membangun layanan pengambilan saldo bon toko belum lunas per anggota, mesin konsolidasi & pengambilalihan tenor cicilan bon toko (`superseded` -> `active`), generator jadwal angsuran bulanan tanpa selisih pembulatan, serta fungsi penagihan jadwal angsuran di `storeCreditLedgerService.ts`, lalu mengintegrasikannya ke alur checkout POS di `posCheckoutService.ts`.

## Context
- .gsd/SPEC.md
- .gsd/phases/96/RESEARCH.md
- src/services/storeCreditLedgerService.ts
- src/services/posCheckoutService.ts
- src/types/pos.ts
- src/services/storeCreditLedgerService.test.ts
- src/services/posCheckoutService.test.ts

## Tasks

<task type="auto">
  <name>Add Store Credit Installment Engine to storeCreditLedgerService.ts</name>
  <files>
    src/services/storeCreditLedgerService.ts
    src/services/storeCreditLedgerService.test.ts
  </files>
  <action>
    1. Tambahkan tipe TypeScript di `src/services/storeCreditLedgerService.ts`:
       - `StoreCreditInstallmentPlan`, `StoreCreditSchedule`, `StoreCreditPlanWithSchedules`, dan `MemberStoreCreditSummary`.
    2. Implementasikan `getMemberUnpaidStoreCreditSummary(memberId: string)`:
       - Ambil rencana aktif terbaru (`status = 'active'`) milik `memberId` dari `store_credit_installment_plans` beserta seluruh jadwalnya di `store_credit_schedules` (diurutkan `period_number ASC`).
       - Hitung `scheduleUnpaid = sum(Math.max(0, Number(target_amount) - Number(paid_amount || 0)))`.
       - Hitung juga `ledgerDebt = await getMemberActiveDebt(memberId)` untuk menangani transaksi bon historis sebelum rencana cicilan ada.
       - Jika `activePlan` ada dan memiliki sisa jadwal > 0, gunakan `scheduleUnpaid`; jika tidak ada `activePlan`, gunakan `ledgerDebt`.
       - Kembalikan `{ unpaidBalance, activePlan, existingTenor, existingMonthlyInstallment }`.
    3. Implementasikan `createOrTakeoverStoreCreditPlan(payload: { memberId: string; saleId: string; previousUnpaidBalance: number; newCreditAmount: number; tenorMonths: number; userId?: string })`:
       - Validasi `memberId`, `newCreditAmount > 0`, dan `tenorMonths = Math.max(1, Math.round(payload.tenorMonths))`.
       - Ubah seluruh rencana `status = 'active'` milik `memberId` di `store_credit_installment_plans` menjadi `status = 'superseded'` dengan `updated_at`.
       - Hitung:
         `totalConsolidatedDebt = Math.round(payload.previousUnpaidBalance + payload.newCreditAmount)`
         `monthlyInstallment = Math.round(totalConsolidatedDebt / tenorMonths)`
       - Simpan rencana baru (`status = 'active'`) ke `store_credit_installment_plans`.
       - Bangkitkan `tenorMonths` baris pada `store_credit_schedules` mulai bulan berikutnya (`+1 bulan` s/d `+tenorMonths`), dengan `target_amount` periode terakhir disesuaikan (`totalConsolidatedDebt - monthlyInstallment * (tenorMonths - 1)`) agar jumlah total `target_amount` tepat sama dengan `totalConsolidatedDebt`.
       - AVOID: Menyentuh `public.loans` atau `public.loan_schedules`.
    4. Implementasikan `getActiveStoreCreditPlans()`:
       - Mengambil seluruh rencana `status = 'active'` dari `store_credit_installment_plans`, menggabungkan profil anggota (`anggota`: `nama`, `nrp`, `pangkat`) dan jadwalnya dari `store_credit_schedules`.
    5. Implementasikan `payStoreCreditSchedule({ scheduleId, amount, paymentMethod, receiptNo, notes, receivedBy })`:
       - Ambil jadwal target + rencana induknya.
       - Perbarui `paid_amount` dan `status` (`'paid'` jika `newPaid >= target_amount`, selain itu `'partial'`) pada `store_credit_schedules`.
       - Panggil `settleStoreCredit({ memberId: plan.member_id, amount: appliedAmount, paymentMethod, referenceNo: receiptNo, notes, receivedBy })` agar tercatat sah di `store_credit_payments` (dan `cash_flow` bila `'tunai'`) tanpa menyisipkan kolom ilegal ke `store_credit_payments`.
       - Jika seluruh jadwal pada `plan_id` berstatus `'paid'`, perbarui `store_credit_installment_plans.status = 'paid_off'`.
    6. Tambahkan unit test di `src/services/storeCreditLedgerService.test.ts` yang menguji:
       - Perhitungan `getMemberUnpaidStoreCreditSummary` (dari rencana aktif maupun dari utang bon historis tanpa rencana).
       - Takeover rencana lama (`superseded`) + ketepatan jumlah seluruh `target_amount` (termasuk pembulatan periode terakhir) pada `createOrTakeoverStoreCreditPlan`.
       - Pelunasan jadwal via `payStoreCreditSchedule` (status jadwal `'paid'` & rencana berubah menjadi `'paid_off'` saat semua periode lunas).
  </action>
  <verify>
    `npx vitest run src/services/storeCreditLedgerService.test.ts`
  </verify>
  <done>
    Semua unit test `storeCreditLedgerService.test.ts` lulus 100%, mencakup lookup sisa bon, takeover tenor, presisi pembulatan periode terakhir, dan pelunasan jadwal.
  </done>
</task>

<task type="auto">
  <name>Integrate Store Credit Plan Creation into posCheckoutService.ts</name>
  <files>
    src/services/posCheckoutService.ts
    src/services/posCheckoutService.test.ts
  </files>
  <action>
    1. Tambahkan properti opsional `storeCreditTenor?: number` pada `CheckoutPayload` di `src/services/posCheckoutService.ts`.
    2. Jika `payload.paidCredit > 0 && payload.memberId`:
       - **PENTING (Cegah Double Counting):** Panggil `getMemberUnpaidStoreCreditSummary(payload.memberId)` **SEBELUM** eksekusi `supabase.rpc('process_pos_checkout', ...)` maupun fallback `supabase.from('sales').insert(...)`, sehingga nota penjualan baru belum terhitung ke dalam `previousUnpaidBalance`.
    3. Refactor alur return `processCheckout` agar baik jalur sukses RPC (`rpcExecuted && rpcResult`) maupun jalur fallback client-side menghasilkan `{ resolvedSaleId, resolvedSaleNumber }` terlebih dahulu sebelum mengembalikan hasil.
    4. Setelah `resolvedSaleId` terbentuk dan jika `payload.paidCredit > 0 && payload.memberId`:
       - Panggil `createOrTakeoverStoreCreditPlan({ memberId: payload.memberId, saleId: resolvedSaleId, previousUnpaidBalance: preCheckoutSummary.unpaidBalance, newCreditAmount: payload.paidCredit, tenorMonths: payload.storeCreditTenor || preCheckoutSummary.existingTenor || 1, userId: payload.cashierId || undefined })`.
       - AVOID: Jangan menyisipkan catatan apa pun ke `public.loans`.
    5. Tambahkan unit test di `src/services/posCheckoutService.test.ts` yang memverifikasi:
       - Saat checkout `paidCredit > 0` melalui jalur RPC maupun fallback, `createOrTakeoverStoreCreditPlan` dipanggil dengan `previousUnpaidBalance` sebelum sale baru masuk, `newCreditAmount = payload.paidCredit`, dan `tenorMonths = payload.storeCreditTenor`.
       - Saat checkout tunai (`paidCredit === 0`), `createOrTakeoverStoreCreditPlan` tidak dipanggil.
  </action>
  <verify>
    `npx vitest run src/services/posCheckoutService.test.ts`
  </verify>
  <done>
    `posCheckoutService.test.ts` lulus 100% dan membuktikan rencana angsuran bon toko dibuat pada jalur RPC maupun fallback tanpa double-counting dan tanpa menyentuh `loans`.
  </done>
</task>

## Must-Haves
- [ ] `getMemberUnpaidStoreCreditSummary` membaca sebelum transaksi baru tercatat agar tidak double-counting.
- [ ] `createOrTakeoverStoreCreditPlan` menandai rencana aktif lama sebagai `superseded` dan menjamin total `target_amount` jadwal = `totalConsolidatedDebt`.
- [ ] `payStoreCreditSchedule` menjaga sinkronisasi dengan `store_credit_payments` melalui `settleStoreCredit`.

## Success Criteria
- [ ] `npx vitest run src/services/storeCreditLedgerService.test.ts src/services/posCheckoutService.test.ts` lulus 100%.
