## Current Position
- **Phase**: 96
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 96 planned: Implementasi Konsolidasi & Simulasi Tenor Angsuran Bon Toko di Kasir POS (`/admin/kasir`) serta Buku Bantu Angsuran Bon Toko Terpisah dari Matriks Pinjaman (`/admin/buku-besar-bon-toko`).
- **Research Findings (`.gsd/phases/96/RESEARCH.md`)**:
  - Rute `/admin/kasir` menggunakan `src/pages/pos/index.tsx` dan `src/components/pos/SplitPaymentModal.tsx` (bukan `PaymentModal.tsx`).
  - Migrasi berikutnya adalah `supabase/migrations/052_create_store_credit_installments.sql` (karena `043`–`051` sudah ada).
  - `processCheckout()` di `posCheckoutService.ts` harus mengambil `getMemberUnpaidStoreCreditSummary` **sebelum** RPC/insert `sales` agar tidak terjadi double-counting nota baru, serta menangani jalur sukses RPC maupun fallback.
  - `payStoreCreditSchedule()` menyinkronkan pelunasan ke `store_credit_payments` melalui `settleStoreCredit()`.
- **Plans Created**:
  - `96-1-PLAN.md` (Wave 1): Skema tabel terisolasi `store_credit_installment_plans` & `store_credit_schedules`
  - `96-2-PLAN.md` (Wave 2): Lookup sisa bon, mesin takeover tenor, penagihan jadwal & integrasi checkout POS
  - `96-3-PLAN.md` (Wave 3): Panel sisa bon, pilihan tenor (`1, 2, 3, 6, 12 Bln` + `Custom`), dan simulasi potong gaji di `SplitPaymentModal.tsx`
  - `96-4-PLAN.md` (Wave 4): `StoreCreditScheduleModal.tsx`, tab jadwal di `BukuBesarBonToko.tsx`, unit tests, `tsc --noEmit`, dan `npm run build`

## Next Steps
1. `/execute 96`
