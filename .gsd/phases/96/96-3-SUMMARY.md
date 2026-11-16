# Plan 96-3 Summary: Unpaid Store Credit, Tenor Selector & Installment Simulation in POS SplitPaymentModal

## Objective
Menampilkan total bon toko anggota sebelumnya yang belum lunas, pilihan tenor potong gaji berkala (`1, 2, 3, 6, 12 Bulan` serta opsi `Custom`), dan kartu simulasi angsuran potong gaji per bulan secara real-time di bawah input **Catat Bon Toko (Potong Gaji)** pada modal pembayaran kasir `/admin/kasir` (`SplitPaymentModal.tsx`), lalu meneruskan tenor terpilih saat konfirmasi checkout di `src/pages/pos/index.tsx`.

## Executed Tasks

### Task 1: Add Tenor Selector and Installment Simulation Card to SplitPaymentModal.tsx
- **Commit**: `6ce3673c` - `feat(phase-96): add tenor selector and installment simulation card to SplitPaymentModal`
- **Changes**:
  - Memperbarui interface `SplitPaymentModalProps`:
    - `onConfirm` kini menerima parameter opsional `storeCreditTenor?: number`.
    - Menambahkan `initialStoreCreditSummary` dan `initialStoreCreditTenor` opsional untuk kemudahan unit testing dan inisialisasi synchronous.
  - Mengimplementasikan helper murni `calculateStoreCreditSimulation(previousUnpaidBalance, newBonAmount, tenorMonths)` yang menghitung `consolidatedTotal`, `safeTenor`, dan `monthlyInstallment` dengan `Math.round`.
  - Menginisialisasi state tenor bon toko: `previousUnpaidStoreCredit`, `activeStoreCreditPlan`, `storeCreditTenor`, dan `isCustomTenor`.
  - Menghubungkan pengambilan `getMemberUnpaidStoreCreditSummary(effectiveMemberId)` saat modal dibuka untuk anggota koperasi.
  - Merender kartu simulasi (`bg-amber-50/80 border border-amber-200`) tepat di bawah input Catat Bon Toko saat `!isNonMember && creditAmount > 0`, menampilkan:
    - Total bon toko anggota sebelumnya yang belum lunas.
    - Tombol preset tenor `1 Bln`, `2 Bln`, `3 Bln`, `6 Bln`, `12 Bln`, dan tombol `Custom`.
    - Input angka tenor bulan (`min={1}`, `max={60}`) saat mode `Custom` aktif.
    - Akumulasi bon toko (sisa lama + nota baru).
    - Nilai simulasi potong gaji berkala per bulan.
    - Catatan notifikasi jika terdapat rencana tenor bon sebelumnya yang digantikan (`superseded`).
  - Menyertakan `storeCreditTenor: creditAmount > 0 ? safeTenor : undefined` saat `handleConfirm` memanggil `onConfirm`.
  - Menambahkan 10 unit test komprehensif di `src/components/pos/SplitPaymentModal.test.tsx` untuk menguji formula perhitungan, edge case (nilai negatif/nol/pembagian ganjil), render kartu simulasi, serta memastikan non-anggota atau pembayaran tunai tidak menampilkan simulasi.

### Task 2: Forward storeCreditTenor in src/pages/pos/index.tsx Checkout Handler
- **Commit**: `6f6f45ab` - `feat(phase-96): forward storeCreditTenor in POS index checkout handler`
- **Changes**:
  - Memperbarui signature `handleCheckoutConfirm` di `src/pages/pos/index.tsx` agar menerima `payload.storeCreditTenor?: number`.
  - Meneruskan `storeCreditTenor: payload.storeCreditTenor` ke pemanggilan `processCheckout(...)`.
  - Menjaga keselarasan tipe TypeScript antara `<SplitPaymentModal onConfirm={handleCheckoutConfirm} />` dan `processCheckout`.

## Verification Evidence
- `npx vitest run src/components/pos/SplitPaymentModal.test.tsx`:
  ```
  Test Files  1 passed (1)
       Tests  21 passed (21)
  ```
- `npx vitest run src/services/posCheckoutService.test.ts src/components/pos/SplitPaymentModal.test.tsx`:
  ```
  Test Files  2 passed (2)
       Tests  37 passed (37)
  ```
- `npx tsc --noEmit`: 0 errors.

## Deviations
None. Semua perubahan diimplementasikan sesuai spesifikasi rencana 96.3 tanpa deviasi.

## Next Phase / Wave Readiness
Siap dilanjutkan ke Plan 96.4 (Wave 4): Pembuatan modal detail jadwal angsuran `StoreCreditScheduleModal.tsx`, integrasi tab jadwal dan aksi pembayaran pada buku bantu bon toko `/admin/buku-besar-bon-toko` (`BukuBesarBonToko.tsx`), unit tests, `tsc --noEmit`, dan `npm run build`.
