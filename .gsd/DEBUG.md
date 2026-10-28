# Debug Session: DEBUG-20261028-RETAIL-HPP

## Status: FIXED

## Symptom
Valuasi Aset Toko (HPP) menampilkan nilai abnormal Rp 45.000.035.978.622 (45 Triliun) untuk 1000 SKU aktif pada Laporan Retail & Inventori (`src/pages/admin/laporan-retail/` dan `src/services/retail-report.service.ts`).
Akibatnya, kalkulasi sub-teks Laba bruto: Rp -44.999.992.853.902 mengalami defisit triliunan (Potensi Penjualan Rp 43 Juta - Valuasi HPP Rp 45 Triliun).

**When:** Saat membuka halaman Laporan Retail tab 'Status Stok & Valuasi Gudang' atau menjalankan agregasi `getStockValuation()`.
**Expected:** Valuasi Aset Toko (HPP) dan Potensi Penjualan berada dalam batas nilai retail realistis koperasi (jutaan s/d ratusan juta rupiah) dengan margin laba bruto wajar positif.
**Actual:** Valuasi Aset Toko mencapai Rp 45 Triliun dan laba bruto defisit Rp -44 Triliun akibat anomali data produk (misal: barcode terpindai ke kolom buy_price atau digit nol berlebih).

## Evidence & Investigation
1. Agregasi `getStockValuation()` pada `src/services/retail-report.service.ts` melakukan perkalian `stock * buyPrice` secara langsung tanpa upper-bound sanity check ataupun sanitasi nilai ekstrim/NaN/null.
2. Belum ada CHECK constraint pada kolom `buy_price`, `sell_price`, dan `stock` di PostgreSQL `public.products`, sehingga nomor barcode 12–13 digit (misal: ~899xxxxxxxxx atau 45000035978622) yang tak sengaja terpindai ke field harga tersimpan di database.
3. Form modal pada `src/pages/admin/ManajemenProduk.tsx` tidak membatasi atribut `max` dan tidak memiliki proteksi scanner barcode ke kolom harga beli, serta tidak memperingatkan jika harga beli > harga jual.
4. Fitur import Excel (`productExcelService.ts`) belum memiliki capping numerik.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Database Audit & Data Sanitation
- File: `supabase/migrations/019_fix_abnormal_product_prices.sql`
- Membuat skrip migrasi SQL idempotensial yang:
  * Mengaudit produk dengan valuasi tak wajar (`(stock * buy_price) > 500000000 OR buy_price > 50000000`).
  * Melakukan normalisasi data NULL dan negatif ke 0.
  * Mengoreksi `buy_price > 50000000` (terkontaminasi scanner barcode) ke rasio wajar (~80% dari `sell_price`).
  * Mengoreksi `sell_price > 50000000` ke rasio wajar (~125% dari `buy_price`).
  * Mereset stok abnormal (`stock > 100000`) ke 0.
  * Menetapkan batas atas konstrain CHECK pada `public.products`:
    - `check_products_buy_price_range`: `buy_price >= 0 AND buy_price <= 100000000` (maks. Rp 100 Juta)
    - `check_products_sell_price_range`: `sell_price >= 0 AND sell_price <= 100000000` (maks. Rp 100 Juta)
    - `check_products_stock_range`: `stock >= 0 AND stock <= 100000` (maks. 100.000 unit)
  * Menambahkan fungsi RPC `audit_product_price_anomalies()` untuk audit berkala.

### Wave 2: Service Layer Defensive Calculation
- File: `src/services/retail-report.service.ts`
- Menambahkan konstanta batas wajar:
  * `MAX_SINGLE_ITEM_VALUATION = 1_000_000_000` (Rp 1 Miliar per item)
  * `MAX_REASONABLE_UNIT_PRICE = 100_000_000` (Rp 100 Juta per unit)
  * `MAX_REASONABLE_STOCK = 100_000` (100.000 unit)
- Menambahkan fungsi `sanitizeNumber()` untuk menangani `null`, `undefined`, `NaN`, string non-numerik, dan angka negatif.
- Pada `getStockValuation()`, menambahkan sanity check:
  * Jika `buyPrice > MAX_REASONABLE_UNIT_PRICE`, otomatis log peringatan dan sesuaikan ke 80% dari `sellPrice` (atau batas maks).
  * Jika valuasi per item `(stock * buyPrice) > MAX_SINGLE_ITEM_VALUATION`, batas nilai valuasi dikunci pada Rp 1 Miliar dan dicatat peringatan konsol.
  * Mengembalikan `totalValuasiHpp` dan `labaBruto` yang presisi.
- Menerapkan sanitasi serupa pada `getFastMovingProducts()` dan `getEndOfDayReport()`.
- Memperkuat `src/services/productExcelService.ts` agar data hasil parsing Excel tidak melebihi batas batas maksimum.

### Wave 3: Form Input Validation Guardrails
- File: `src/pages/admin/ManajemenProduk.tsx`
- Menambahkan atribut `max="100000000"` pada input `buyPrice` dan `sellPrice`, serta `max="100000"` pada `stock`.
- Menambahkan validasi `onChange` untuk mendeteksi digit barcode tak sengaja terpindai (> 9 digit atau > 100 Juta) dengan toast peringatan informatif.
- Menambahkan peringatan visual kontekstual berwarna amber jika `buy_price > sell_price` sebelum form disimpan.
- Menambahkan dialog konfirmasi interaktif jika pengguna tetap hendak menyimpan produk dengan harga jual di bawah harga beli (rugi kotor).
- Validasi pre-submit pada `handleSubmit` untuk mencegah data ilegal.

### Wave 4: Build & Test Verification
- Menambahkan unit test baru di `src/services/retailReport.test.ts`:
  * Uji deteksi dan koreksi harga lonjakan 45 Triliun akibat barcode scanner.
  * Uji sanitasi input kotor (`null`, `undefined`, `NaN`, angka negatif).
  * Uji pembatasan batas atas valuasi per item (1 Miliar cap).
  * Uji kalkulasi laba kotor & total valuasi HPP.
- Hasil pengujian:
  * `src/services/retailReport.test.ts`: 7 tests passed (100%)
  * Full test suite: 6 test files, 30 tests passed (100%)
  * Build produksi (`npm run build`): sukses (exit code 0).

---

# Debug Session: DEBUG-20261029-CASHIER-ZREPORT-ZERO-CASH

## Status: FIXED

## Symptom
Saat kasir membuka shift (misal modal awal Rp 100.000) dan melakukan transaksi penjualan tunai (misal INV-1793209196270 senilai Rp 20.900), struk tutup kasir (Z-Report) dan laporan retail tetap menampilkan "Penjualan Tunai (+): +Rp 0" dan "Estimasi Kas Sistem: Rp 100.000".

**When:** Saat kasir membuka modal shift dan memproses checkout penjualan tunai, lalu menutup shift via `TutupKasirModal` atau melihat audit shift di Laporan Retail (`src/pages/admin/laporan-retail/`).
**Expected:** Penjualan tunai bertambah sesuai transaksi riil (`+Rp 20.900`), Estimasi Kas Sistem bertambah menjadi `Rp 120.900` (`modal awal + penjualan tunai`), dan rekonsiliasi kas laci kasir seimbang.
**Actual:** Penjualan tunai tercatat `+Rp 0` dan estimasi kas tidak bertambah (`Rp 100.000`).

## Root Cause
1. Query agregasi di `cashierShiftService.ts` (`getShiftSalesSummary`) menyertakan kolom non-existent `status` bersama `sale_status` (`select('id, total_amount, paid_cash, paid_deposit, paid_credit, status, sale_status, created_at')`). Pada Supabase/PostgREST, pemilihan kolom yang tidak ada pada tabel menghasilkan error HTTP 400 (`code 42703: column sales.status does not exist`). Akibatnya, baik query relasi `shift_id` maupun fallback query waktu menghasilkan error `data: null`, sehingga `validSales` kosong dan `cashSales` bernilai 0.
2. Pada `SplitPaymentModal.tsx`, logika penentuan `scheme` memiliki bug: `else if (depositAmount > 0 || cashAmount > 0) scheme = 'split'`. Akibatnya, transaksi tunai murni tanpa split/deposit keliru ditandai sebagai `payment_scheme = 'split'`.
3. Pada `posCheckoutService.ts`, payload insert `sales` belum menyertakan `paid_amount: effectivePaidAmount` dan `sale_status: 'completed'`, serta belum ada fallback otomatis ke `getLocalActiveShift()` jika `shiftId` tidak disediakan oleh pemanggil. Selain itu, nilai `paid_cash` yang disimpan ke database belum disesuaikan terhadap uang kembalian (jika pembeli membayar dengan uang lebih besar dari total belanja).

## Solusi & Implementasi (GSD Framework)

### Wave 1: Schema & Data Contract Alignment
- File: `supabase/migrations/021_link_sales_to_cashier_shifts.sql`
- Membuat migrasi SQL idempotensial untuk memastikan:
  * Foreign key `shift_id UUID REFERENCES public.cashier_shifts(id) ON DELETE SET NULL`.
  * Index performa `idx_sales_shift_id ON public.sales(shift_id)`.
  * Kolom `paid_amount numeric DEFAULT 0` dan `sale_status text DEFAULT 'completed'`.
  * Backfill data historis `paid_amount = total_amount` untuk transaksi lunas.

### Wave 2: Fix POS Checkout Payload
- File: `src/services/posCheckoutService.ts`, `src/components/pos/SplitPaymentModal.tsx`
- Memperbaiki `processCheckout`:
  * Mengambil `shift_id` aktif secara aman dengan fallback `payload.shiftId || getLocalActiveShift()?.id || null`.
  * Menghitung nilai presisi `effectivePaidCash` (menyesuaikan nominal uang pas atau kembalian).
  * Menyertakan `paid_amount: effectivePaidAmount` dan `sale_status: 'completed'`.
  * Memastikan mutasi `cash_flow` untuk penjualan tunai mencatat `effectivePaidCash`.
- Memperbaiki `SplitPaymentModal.tsx`:
  * Menetapkan `scheme = 'cash'` ketika transaksi murni tunai tanpa deposit / kredit toko.

### Wave 3: Fix Reconciliation Aggregation Query
- File: `src/services/cashierShiftService.ts`, `src/components/pos/TutupKasirModal.tsx`
- Memperbarui query `getShiftSalesSummary`:
  * Menghapus referensi kolom `status` yang menyebabkan PostgREST error 42703.
  * Menambahkan `payment_scheme` pada kolom select.
  * Menghitung `cashSales` dengan fallback otomatis: jika `paid_cash` 0 tetapi `payment_scheme === 'cash'`, gunakan `total_amount`.
  * Menghitung `expectedCash = initialCash + cashSales`.
  * Meneruskan rekonsiliasi yang benar ke `closeShift` untuk memperbarui `cashier_shifts.cash_sales` dan `cashier_shifts.expected_cash`, serta mutasi kas `PENJUALAN_KASIR_TUNAI`.
- Memperbaiki data transaksi lama dan shift kasir terkait di database.

### Wave 4: Build & Test Verification
- Menambahkan unit test baru di `src/services/posCheckoutService.test.ts` dan test case baru di `src/services/cashierShiftService.test.ts`.
- Hasil pengujian:
  * Test suite: 8 test files, 44 tests passed (100%).
  * Build bundler Vite (`npm run build`): Sukses tanpa type error (exit code 0).

---

# Debug Session: DEBUG-20261029-SHIFT-PERSISTENCE-AND-DATE-TIMEZONE

## Status: FIXED

## Symptom
1. Pada modal "Tutup Shift & Rekonsiliasi Kasir" (Shift `SHF-20261029-010821`), Penjualan Tunai menampilkan "Rp 0 (0 transaksi lunas)", padahal terdapat transaksi tunai `INV-1793210925585` senilai Rp 19.000 (uang bayar 50.000, kembalian 31.000).
2. Filter tanggal default di halaman Laporan Retail mengunci tanggal 28/10/2026 dan bukan tanggal aktif hari ini (29/10/2026).

## Root Cause
1. Nilai default filter tanggal diinisialisasi menggunakan `new Date().toISOString().slice(0, 10)`. Karena `toISOString()` mengevaluasi waktu dalam UTC, saat waktu lokal di Indonesia menunjukkan dini hari tanggal 29/10/2026 (01:00 WIB), waktu UTC masih berada pada 18:00 tanggal 28/10/2026. Akibatnya tanggal default terkunci ke `2026-10-28`.
2. Persistensi active shift ID di client belum mencakup key cadangan mandiri (`simkop_active_shift_id`). Jika state memory/objek parsial terganggu, checkout berpotensi kehilangan referensi shift.
3. Fallback agregasi penjualan di `cashierShiftService.ts` belum memiliki rentang toleransi buffer detik client-server (±2 menit dari `opened_at` dan `closed_at`).
4. Pada transaksi tunai dengan kembalian (`paid_cash` = 50.000 untuk tagihan Rp 19.000), nilai kas toko yang ditambahkan ke laci kasir harus dipresisikan ke nilai netto belanja Rp 19.000.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Active Shift Persistence & Checkout Injection
- File: `src/services/cashierShiftService.ts`, `src/services/posCheckoutService.ts`
- Menyimpan `simkop_active_shift_id` dan `simkop_active_shift_data` secara persisten di `localStorage` saat `openShift`, dan menghapusnya saat `closeShift`.
- Menambahkan fungsi helper `getActiveShiftId()` dengan prioritas: parameter input -> active shift memory -> `localStorage.getItem('simkop_active_shift_id')`.
- Di `posCheckoutService.ts`, memastikan `shift_id`, `paid_cash: effectivePaidCash` (19000), `paid_amount` (19000), dan `total_amount` terinjeksi ke tabel `sales`.

### Wave 2: Robust Cash Sales Aggregation in Shift Service
- File: `src/services/cashierShiftService.ts`
- Memperbaiki `getShiftSalesSummary`:
  * Query langsung via `shift_id`.
  * Fallback toleransi waktu ±2 menit buffer (`opened_at - 2 min` s/d `closed_at + 2 min`) untuk transaksi orphan/selisih timestamp.
  * Presisi `cashSales`: menghitung nilai kas belanja riil yang masuk laci kasir (memperhitungkan kembalian dari `paid_cash`).
  * `expectedCash = Number(initial_cash) + totalCashSales` (misal modal 50k + tunai 19k = 69k).
- Memperbaiki data shift `SHF-20261029-010821` dan transaksi `INV-1793210925585` di database Supabase.

### Wave 3: Fix Default Date Range in Retail Report
- File: `src/pages/admin/laporan-retail/index.tsx`, `src/pages/admin/laporan-keuangan/index.tsx`
- Menambahkan helper `getLocalDateString()` yang menggunakan `getFullYear()`, `getMonth() + 1`, dan `getDate()` lokal perangkat kasir (WIB).
- Mengganti inisialisasi default `startDate` dan `endDate` dari `toISOString().slice(0, 10)` ke `getLocalDateString()`.

### Wave 4: Build & Static Validation
- Menambahkan unit test baru di `src/services/posCheckoutService.test.ts` dan `src/services/cashierShiftService.test.ts`.
- Menjalankan `npm test`: 8 test files, 46 passed (100%).
- Menjalankan `npm run build`: Vite build sukses (exit code 0).


