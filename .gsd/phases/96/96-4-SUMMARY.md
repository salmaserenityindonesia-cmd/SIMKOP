# Plan 96-4 Summary: Buku Bantu Angsuran Bon Toko in `/admin/buku-besar-bon-toko` & Full Production Verification

## Objective
Menyediakan modal **Buku Bantu Angsuran Bon Toko** (`StoreCreditScheduleModal.tsx`) dan tab **Jadwal Angsuran Bon Toko (Potong Gaji)** di `/admin/buku-besar-bon-toko` (`BukuBesarBonToko.tsx`) agar penagihan angsuran bon toko dikelola mandiri dan terpisah total dari Matriks Pinjaman (`/admin/loan-matrix`), lalu memverifikasi seluruh suite test, TypeScript, dan build Vite produksi.

## Executed Tasks

### Task 1: Create StoreCreditScheduleModal.tsx Component
- **Commit**: `30b0d945` - `feat(phase-96): create StoreCreditScheduleModal component`
- **Changes**:
  - Membuat komponen `src/components/pos/StoreCreditScheduleModal.tsx` dengan props `isOpen`, `plan`, `onClose`, dan `onSuccess`.
  - Merender ringkasan identitas anggota (`nama`, `nrp`, `pangkat`) dan status rencana (`Aktif` / `Lunas` / `Ditimpa`).
  - Menampilkan rincian akumulasi konsolidasi: `Sisa Bon Lama`, `Nota Baru`, `Total Konsolidasi`, `Tenor Aktif`, dan `Angsuran Potong Gaji / Bulan`.
  - Menyediakan form penagihan angsuran: pemilih metode pembayaran (`Potong Gaji`, `Tunai`, `Transfer`), input `No. Bukti / Kwitansi`, dan input `Catatan`.
  - Merender tabel jadwal angsuran per periode dengan kolom `Periode`, `Jatuh Tempo`, `Target Angsuran`, `Terbayar`, `Sisa Tagihan`, status badge (`LUNAS`, `SEBAGIAN`, `BELUM BAYAR`), input nominal kustom/parsial, dan tombol **"Tagih / Lunasi Angsuran"**.
  - Mengintegrasikan pemanggilan `payStoreCreditSchedule` dengan feedback toast via `useFeedback()` dan callback `onSuccess()`.
  - Membuat unit test `src/components/pos/StoreCreditScheduleModal.test.tsx` (5 passed) yang memverifikasi seluruh elemen visual, fungsionalitas penagihan, serta isolasi penuh dari `/admin/loan-matrix`.

### Task 2: Add Jadwal Angsuran Bon Toko Tab to BukuBesarBonToko.tsx
- **Commit**: `5dc154e8` - `feat(phase-96): add jadwal angsuran bon toko tab to BukuBesarBonToko`
- **Changes**:
  - Memperbarui `src/pages/admin/BukuBesarBonToko.tsx` dengan menambahkan state tab aktif (`activeTab: 'ledger' | 'installments'`) dan state rencana angsuran aktif (`activePlans`, `selectedPlanForSchedule`, `isScheduleModalOpen`).
  - Mengintegrasikan pemanggilan `getActiveStoreCreditPlans()` dalam `loadLedgerData()`.
  - Menambahkan switcher tab responsif antara **"Mutasi Buku Besar Bon"** dan **"Jadwal Angsuran Bon Toko (Potong Gaji)"** (dilengkapi badge jumlah rencana aktif).
  - Pada tab jadwal angsuran, merender daftar anggota yang memiliki rencana angsuran bon aktif dengan kolom `No`, `Anggota` (Nama & NRP & Pangkat), `Total Akumulasi Bon`, `Tenor Aktif`, `Potong Gaji / Bln`, `Progres Angsuran`, `Sisa Tagihan`, dan tombol aksi **"Buku Bantu Angsuran"**.
  - Menghubungkan klik tombol ke pembukaan modal `<StoreCreditScheduleModal />` dengan refresh otomatis saat pembayaran berhasil.
  - Memperbarui `src/pages/admin/BukuBesarBonToko.test.tsx` (7 passed) untuk mock `getActiveStoreCreditPlans` dan `payStoreCreditSchedule` serta menguji rendering tab switcher dan ketiadaan referensi ke Matriks Pinjaman.

### Task 3: Full Static Analysis, Test Suite & Vite Production Build Verification
- **Commit**: `4b27576b` - `feat(phase-96): static analysis and production build verification`
- **Changes**:
  - Menjalankan 64 unit test di seluruh file test POS & Bon Toko (`storeCreditLedgerService.test.ts`, `posCheckoutService.test.ts`, `SplitPaymentModal.test.tsx`, `StoreCreditScheduleModal.test.tsx`, `BukuBesarBonToko.test.tsx`). Semua 64 test lulus 100%.
  - Menjalankan verifikasi tipe TypeScript `npx tsc --noEmit` tanpa error (exit code 0).
  - Menjalankan build produksi `npm run build` menggunakan Vite/rolldown dan berhasil menghasilkan bundle produksi `dist/` dalam 1.17 detik tanpa error (exit code 0).
  - Memastikan `src/pages/admin/LoanMatrix.tsx` dan `src/services/loanService.ts` tetap terisolasi dan tidak tersentuh.

## Verification Evidence
- `npx vitest run src/services/storeCreditLedgerService.test.ts src/services/posCheckoutService.test.ts src/components/pos/SplitPaymentModal.test.tsx src/components/pos/StoreCreditScheduleModal.test.tsx src/pages/admin/BukuBesarBonToko.test.tsx`:
  ```
  Test Files  5 passed (5)
       Tests  64 passed (64)
    Duration  922ms
  ```
- `npx tsc --noEmit`: Exit code 0 (tanpa galat).
- `npm run build`: Exit code 0 (bundle selesai 1.17s).

## Deviations
None. Seluruh rencana 96.4 selesai dieksekusi secara mulus.

## Phase 96 Completion
Dengan selesainya Plan 96.4, seluruh 4 Wave pada Phase 96 telah selesai:
1. `96-1`: Skema database terisolasi `store_credit_installment_plans` & `store_credit_schedules` (`052_create_store_credit_installments.sql`).
2. `96-2`: Mesin takeover konsolidasi, pencatatan jadwal, dan integrasi atomic/fallback checkout POS di `posCheckoutService.ts`.
3. `96-3`: Panel informasi sisa bon, pemilih tenor `1, 2, 3, 6, 12 Bln` + `Custom`, serta simulasi potong gaji real-time di POS `/admin/kasir` (`SplitPaymentModal.tsx` & `index.tsx`).
4. `96-4`: Modal Buku Bantu Angsuran Bon Toko (`StoreCreditScheduleModal.tsx`), tab jadwal di `/admin/buku-besar-bon-toko` (`BukuBesarBonToko.tsx`), dan pengujian menyeluruh static analysis + build Vite.
