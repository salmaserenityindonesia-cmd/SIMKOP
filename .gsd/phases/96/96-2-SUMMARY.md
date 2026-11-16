# Plan 96-2 Summary: Unpaid Store Credit Lookup, Tenor Takeover Engine & POS Checkout Integration

## Objective
Membangun layanan pengambilan saldo bon toko belum lunas per anggota, mesin konsolidasi & pengambilalihan tenor cicilan bon toko (`superseded` -> `active`), generator jadwal angsuran bulanan tanpa selisih pembulatan, serta fungsi penagihan jadwal angsuran di `storeCreditLedgerService.ts`, lalu mengintegrasikannya ke alur checkout POS di `posCheckoutService.ts`.

## Executed Tasks

### Task 1: Add Store Credit Installment Engine to storeCreditLedgerService.ts
- **Commit**: `09fb78ce` - `feat(phase-96): add store credit installment engine and schedule service`
- **Changes**:
  - Didefinisikan interface TypeScript: `StoreCreditInstallmentPlan`, `StoreCreditSchedule`, `StoreCreditPlanWithSchedules`, `MemberStoreCreditSummary`, `CreateStoreCreditPlanPayload`, dan `PayStoreCreditSchedulePayload`.
  - Diimplementasikan `getMemberUnpaidStoreCreditSummary(memberId)`: mengambil rencana aktif terbaru (`status = 'active'`) beserta jadwalnya dari `store_credit_schedules`. Jika rencana aktif ditemukan, menghitung sisa jadwal belum lunas; jika belum ada rencana, membaca `getMemberActiveDebt(memberId)` dari transaksi historis.
  - Diimplementasikan `createOrTakeoverStoreCreditPlan(...)`: mengubah seluruh rencana aktif lama milik anggota menjadi `status = 'superseded'`, mengonsolidasikan utang lama + bon baru, menghitung cicilan bulanan, membuat record rencana baru di `store_credit_installment_plans`, dan membangkitkan baris jadwal `store_credit_schedules` per bulan dengan penyesuaian nilai angsuran di periode terakhir agar totalnya tepat 100% tanpa selisih pembulatan. Terisolasi penuh tanpa menyentuh tabel `loans`.
  - Diimplementasikan `getActiveStoreCreditPlans()`: mengambil daftar rencana aktif dengan join profil `anggota` dan jadwal terurut `period_number ASC`.
  - Diimplementasikan `payStoreCreditSchedule(...)`: memperbarui status jadwal angsuran (`paid` atau `partial`), mencatat mutasi pelunasan ke `store_credit_payments` (dan `cash_flow` bila metode tunai) via `settleStoreCredit()`, serta mengubah status rencana induk menjadi `paid_off` bila seluruh jadwal telah lunas.
  - Ditambahkan unit test lengkap di `src/services/storeCreditLedgerService.test.ts` (15 tests lulus).

### Task 2: Integrate Store Credit Plan Creation into posCheckoutService.ts
- **Commit**: `bee8373b` - `feat(phase-96): integrate store credit plan creation into pos checkout`
- **Changes**:
  - Ditambahkan properti opsional `storeCreditTenor?: number` pada interface `CheckoutPayload`.
  - **Pencegahan Double-Counting**: Memanggil `getMemberUnpaidStoreCreditSummary(payload.memberId)` **SEBELUM** eksekusi RPC transaksi kasir (`process_pos_checkout`) maupun fallback client-side `sales.insert`. Dengan demikian nilai `previousUnpaidBalance` tidak terhitung ganda dengan bon belanja yang baru saja di-checkout.
  - Direfaktor alur checkout agar baik jalur RPC yang sukses maupun fallback client-side menghasilkan `{ resolvedSaleId, resolvedSaleNumber }`.
  - Setelah `resolvedSaleId` terbit dan transaksi belanja bon (`paidCredit > 0`) tercatat, sistem memanggil `createOrTakeoverStoreCreditPlan` dengan `saleId = resolvedSaleId`, `previousUnpaidBalance = preCheckoutSummary.unpaidBalance`, `newCreditAmount = payload.paidCredit`, dan `tenorMonths = payload.storeCreditTenor || preCheckoutSummary.existingTenor || 1`.
  - Ditambahkan unit test di `src/services/posCheckoutService.test.ts` yang memvalidasi pembentukan rencana cicilan pada jalur RPC dan fallback, fallback tenor, serta memastikan transaksi tunai (`paidCredit === 0`) tidak memanggil pembuatan rencana cicilan bon toko.

## Verification Evidence
- `npx vitest run src/services/storeCreditLedgerService.test.ts src/services/posCheckoutService.test.ts`:
  ```
  Test Files  2 passed (2)
       Tests  31 passed (31)
  ```
- `npx tsc --noEmit`: 0 errors.

## Deviations
None. Semua implementasi mengikuti spesifikasi dan rencana tanpa deviasi.

## Next Phase / Wave Readiness
Siap dilanjutkan ke Plan 96.3 (Wave 3): Implementasi panel sisa bon, pilihan tenor (`1, 2, 3, 6, 12 Bln` + `Custom`), dan simulasi potong gaji di `SplitPaymentModal.tsx`.
