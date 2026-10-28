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
