## Current Position
- **Phase**: 59 (Integrasi Pembayaran Kasir POS Menggunakan Simpanan Belanja Anggota)
- **Task**: Planning completed, ready for execution
- **Status**: Planned (3 plans defined across 3 waves)

## Last Session Summary
Phase 58 completed and verified. Debugging of duplicate uncheck logs and preservation of manual admin cancellation reasons resolved and verified.
Phase 59 planned into 3 atomic plans:
- **Plan 59.1**: Database RPC for Atomic Balance Deduction (`036_pos_spending_from_savings_function.sql`) & Service Layer Integration (`src/services/posCheckoutService.ts`).
- **Plan 59.2**: POS SplitPaymentModal Validation & Cashier Shift Reconciliation Guard (`src/components/pos/SplitPaymentModal.tsx` & `src/services/cashierShiftService.ts`).
- **Plan 59.3**: Static Verification, Comprehensive Test Suite & Production Build Verification (`tsc --noEmit`, Vitest, `npm run build`).

## Next Steps
Execute Plan 59.1:
1. Buat berkas migrasi `supabase/migrations/036_pos_spending_from_savings_function.sql` untuk fungsi RPC `process_pos_deposit_payment`.
2. Integrasikan pemanggilan RPC tersebut pada `src/services/posCheckoutService.ts` dan buat unit test di `posCheckoutService.test.ts`.

## Blockers
- None.

## Context Dump

### Decisions Made
- **Sequential Migration Numbering**: Menggunakan nomor urut `036` (`036_pos_spending_from_savings_function.sql`) karena nomor 033, 034, dan 035 telah digunakan pada fase sebelumnya.
- **Atomic Balance & Anti-Overdraft Protection**: Validasi ketersediaan saldo dan penyisipan transaksi `withdrawal` dilakukan di level PostgreSQL via RPC dengan `SECURITY DEFINER` untuk mencegah race condition / overdraft.
- **Strict Drawer Cash Separation**: Nilai `paid_deposit` hanya dicatat pada `sales.paid_deposit` dan tidak dimasukkan ke dalam `cash_sales` / `expected_cash` laci kasir agar rekonsiliasi kas fisik shift tetap akurat 100%.
- **Responsive Cashier Safeguard**: Pada modal pembayaran kasir (`SplitPaymentModal.tsx`), input simpanan belanja dikunci jika non-anggota atau saldo nol, dilengkapi badge sisa saldo riil dan pembatasan otomatis `min(total, saldo)`.
