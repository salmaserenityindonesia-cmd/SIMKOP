# Phase 59: Research & Architecture Analysis
Integrasi Pembayaran Kasir POS Menggunakan Simpanan Belanja Anggota

## 1. Context & Objective
Memungkinkan anggota koperasi menggunakan saldo Simpanan Belanja (`deposit_types.code = 'BELANJA'`) sebagai metode pembayaran belanja di kasir POS (`/admin/kasir`).
Fitur ini harus:
1. Memastikan hanya anggota aktif dengan rekening simpanan belanja aktif dan saldo kas riil mencukupi yang dapat menggunakan metode ini.
2. Memotong saldo secara atomik dan aman dari overdraft melalui PostgreSQL RPC `process_pos_deposit_payment`.
3. Mencatat mutasi penarikan riil di tabel `deposit_transactions` dengan referensi nota kasir (`reference_no`), metode `potong_simpanan_belanja`, catatan, dan id kasir pelaksana (`created_by`).
4. Memvalidasi input kasir pada `SplitPaymentModal.tsx` (F9):
   - Badge status: `Saldo Tersedia: Rp [nominal]`.
   - Mengunci (disable) input jika non-anggota atau saldo = 0.
   - Otomatis membatasi input nominal agar tidak melebihi `Math.min(totalBelanja, saldoTersedia)`.
5. Memastikan pembelanjaan dengan simpanan belanja tidak masuk ke perhitungan kas fisik laci (Z-Report cash float) di `cashierShiftService.ts`.

## 2. Codebase Discovery & Existing State
- **Database (`supabase/migrations/`)**:
  - Kolom `sales.paid_deposit` sudah tersedia dan tercatat saat penjualan.
  - Tabel `deposit_transactions` kini memiliki kolom `reference_no`, `payment_method`, `notes`, `created_by` (dari Phase 58).
  - Migrasi terakhir adalah `035_fix_duplicate_deposit_audit_trigger.sql`. Oleh karena itu, migrasi RPC diberi nomor urut `036_pos_spending_from_savings_function.sql`.
  - RPC `process_pos_deposit_payment` harus:
    - Menerima `p_member_id`, `p_amount`, `p_sale_id`, `p_invoice_number`, `p_cashier_id`.
    - Mencari akun `member_deposits` dengan `dt.code = 'BELANJA'` atau `dt.name ILIKE '%belanja%'`.
    - Menghitung saldo riil saat ini (SUM deposit - SUM withdrawal).
    - Memvalidasi kecukupan saldo (tolak jika saldo < amount).
    - Menyisipkan mutasi `withdrawal` ke `deposit_transactions`.
    - Mengembalikan jsonb `{ success: true, remaining_balance: ... }`.
- **Checkout Service (`src/services/posCheckoutService.ts`)**:
  - Saat `paidDeposit > 0`: panggil RPC `process_pos_deposit_payment`.
  - Jika RPC gagal, batalkan checkout dan kembalikan pesan error.
  - Sediakan fallback client-side yang aman untuk environment mock / unit tests.
- **Kasir UI (`src/components/pos/SplitPaymentModal.tsx`)**:
  - Komponen modal pembayaran split sudah memiliki input "Potong Simpanan Belanja", namun perlu:
    - Menampilkan badge ketersediaan saldo: `Saldo Tersedia: Rp [nominal]`.
    - Menonaktifkan input jika non-anggota atau `belanjaBalance <= 0`.
    - Validasi onChange: batasi nilai input tidak melebihi `Math.min(total, financials.belanjaBalance)`.
- **Shift Kasir (`src/services/cashierShiftService.ts`)**:
  - `totalCashSales` hanya menghitung porsi tunai (`paid_cash`), dan secara tegas tidak menjumlahkan `paid_deposit` maupun `paid_credit` ke dalam `expected_cash`.

## 3. Plan Decomposition Strategy (Aggressive Atomicity)
- **Plan 59.1 (Wave 1 & Wave 3 Part 1)**: Database RPC `process_pos_deposit_payment` (`036_pos_spending_from_savings_function.sql`) & Integrasi di `posCheckoutService.ts`.
- **Plan 59.2 (Wave 2 & Wave 3 Part 2)**: Validasi Ketersediaan Saldo di `SplitPaymentModal.tsx` & Proteksi Rekonsiliasi Kas di `cashierShiftService.ts`.
- **Plan 59.3 (Wave 4)**: Static Verification (`tsc --noEmit`), Comprehensive Test Suite & Production Build.

