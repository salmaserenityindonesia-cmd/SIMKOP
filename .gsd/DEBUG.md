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

# Debug Session: DEBUG-20261031-POS-QTY-F4

## Status: FIXED

## Symptom
Pada halaman kasir POS (`/admin/kasir` atau `/pos`), saat menekan hotkey F4 (atau klik tombol "F4 Qty" di header POS):
- Dialog modal "Kuantitas (Qty)" muncul untuk mengubah kuantitas item terakhir di keranjang.
- Bug: Nilai yang diinputkan di modal tidak langsung menjadi kuantitas item, melainkan mengalami perhitungan salah (misal: Qty awal 1, diinput angka 5, hasil akhir menjadi 11).

**When:** Saat menekan F4 pada item yang sudah ada di keranjang kasir, menginputkan angka baru, dan menekan Enter atau klik Simpan.
**Expected:** Kuantitas item di keranjang belanja langsung tergantikan (*exact replacement*) menjadi nilai yang diinputkan (misal: 5).
**Actual:** Kuantitas terhitung secara keliru menjadi 11 (`1 + 5 + 5`).

## Root Cause
1. **Additive Mutation on Edit Mode**: Handler `handleConfirmQty` di `src/pages/pos/index.tsx` selalu menjalankan mutasi penambahan `next[existing].qty += qty` tanpa membedakan apakah modal dibuka untuk menambah produk baru dari katalog/scan (`mode: 'add'`) atau memodifikasi item keranjang via F4 (`mode: 'edit'`). Akibatnya, angka baru ditambahkan ke kuantitas awal alih-alih menggantikannya (`1 + 5 = 6`).
2. **Double Triggering on Enter Key**: Pada `src/components/pos/QuantityModal.tsx`, listener `onKeyDown` pada input menangani `Enter` dengan memanggil `onConfirm(qty)`, namun tidak memanggil `e.stopPropagation()` dan tombol Simpan tidak memiliki `type="button"`. Hal ini memicu event ganda saat Enter ditekan (input keydown + default button click), sehingga `onConfirm(5)` terpanggil dua kali: `1 + 5 + 5 = 11`.
3. **Missing Current Quantity Pre-fill**: `QuantityModal` menginisialisasi state kuantitas selalu dengan hardcoded `1` (`setQty(1)`) daripada membaca `item.qty` yang sedang aktif di keranjang.
4. **Header F4 Button Stale Target**: Tombol "F4 Qty" di `POSHeader` tidak memanggil `setActiveItemForQty(cart[cart.length - 1])`, menyebabkan target item berpotensi null atau item lama jika dibuka via klik tombol.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Fix Quantity Modal & Cart Mutation Logic
- File: `src/components/pos/QuantityModal.tsx`
  * Menambahkan prop `mode?: 'add' | 'edit'` (judul modal dinamis: "Ubah Kuantitas (Qty)" saat edit).
  * Mengisi nilai default kuantitas dari `item.qty` jika tersedia (`'qty' in item && typeof item.qty === 'number' && item.qty > 0 ? item.qty : 1`) dan auto-select teks saat modal terbuka.
  * Membungkus konten ke dalam `<form onSubmit={handleConfirm}>`.
  * Memastikan fungsi konfirmasi memanggil `e.preventDefault()` dan `e.stopPropagation()`.
  * Menetapkan atribut `type="button"` pada seluruh tombol (Close, Minus, Plus, Batalkan, Simpan) untuk mencegah eksekusi ganda pada event Enter.
- File: `src/pages/pos/index.tsx`
  * Menambahkan state `qtyModalMode` (`'add' | 'edit'`).
  * Pada shortcut F4 dan tombol "F4 Qty" di `POSHeader`: menetapkan `qtyModalMode = 'edit'` dan `setActiveItemForQty(cart[cart.length - 1])`.
  * Pada seleksi produk dari katalog/search (`handleSelectProduct`): menetapkan `qtyModalMode = 'add'`.
  * Memperbarui `handleConfirmQty`:
    - Jika `qtyModalMode === 'edit'`: melakukan *exact replacement* `next[existing].qty = parsedQty`.
    - Jika `qtyModalMode === 'add'`: melakukan akumulasi `next[existing].qty += parsedQty`.
- File: `src/lib/cartStore.ts`
  * Menambahkan alias eksplisit `setQuantity(id, qty)` yang memanggil `updateQty(id, qty)`.

### Wave 2: Verification, Test Suite & Build
- File: `src/components/pos/QuantityModal.test.tsx`
  * Menambahkan unit test suite untuk menguji rendering saat `isOpen` false (null), rendering mode 'add' vs 'edit', keberadaan atribut `type="button"` pada semua tombol, serta simulasi logika penggantian kuantitas F4 (`applyQtyChange` menghasilkan tepat 5 dari nilai awal 1, dan idempoten pada pemanggilan ganda).
- Hasil pengujian:
  * `QuantityModal.test.tsx`: 6 tests passed (100%).
  * Typecheck (`tsc --noEmit`): exit code 0.
  * Full test suite (`npx vitest run`): 19 test files, 199/199 tests passed (100%).
  * Production build (`npm run build`): sukses (exit code 0).


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



# Debug Session: DEBUG-20261030-POS-MEMBER-CARD-CONTRAST

## Status: FIXED

## Symptom
Banner identitas pembeli ("TRANSAKSI ATAS NAMA ANGGOTA:") dan teks informasi anggota pada Modal Pembayaran (F9 / SplitPaymentModal) menggunakan warna font biru muda, putih pudar, dan abu-abu tipis di atas kontainer berlatar abu-abu netral.
Rendahnya rasio kontras membuat nama anggota ("Ahmad Hidayat") dan nomor identitas ("NRP / ID: 95118296") buram dan sulit dibaca oleh kasir.

## Root Cause
Styling Tailwind pada komponen `SplitPaymentModal.tsx` menggunakan kelas kontras rendah (`text-[11px] text-blue-600 dark:text-blue-400`, `text-slate-500 dark:text-slate-400`, border/background pudar) serta avatar berlatar belakang pastel lembut (`bg-blue-100`, `bg-slate-100`) yang menyebabkan keterbacaan teks dan hierarki visual info anggota melemah di layar kasir.

## Solusi & Implementasi (GSD Framework)

### Wave 1: High Contrast Styling pada Member & Non-Member Card
- File: `src/components/pos/SplitPaymentModal.tsx`
- Memperbarui styling container info anggota koperasi:
  * Container Kartu: `bg-blue-50/80 border-2 border-blue-200 rounded-xl p-3.5 mb-4 flex items-center justify-between shadow-xs`
  * Avatar / Icon Lingkaran User: `w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs`
  * Label Seksi: `text-xs font-bold uppercase tracking-wider text-blue-700` ("Transaksi Atas Nama Anggota:")
  * Nama Anggota: `text-base sm:text-lg font-bold text-slate-900 leading-tight truncate`
  * NRP / ID Anggota: `text-xs font-medium text-slate-600 font-mono`
  * Badge Status: `shrink-0 ml-2 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs` ("Anggota Koperasi")
- Memperbarui styling kartu mode Non-Anggota:
  * Container: `bg-slate-100 border-2 border-slate-300 text-slate-800 rounded-xl p-3.5 mb-4 flex items-center justify-between`
  * Avatar: `w-10 h-10 rounded-full bg-slate-500 text-white flex items-center justify-center shrink-0 shadow-xs`
  * Label: `text-xs font-bold uppercase tracking-wider text-slate-600`
  * Teks: `text-base sm:text-lg font-bold text-slate-900 leading-tight` ("Transaksi Non-Anggota (Pelanggan Umum)")
  * Badge: `shrink-0 ml-2 px-3 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 border border-slate-300 shadow-xs` ("Umum")

### Wave 2: Test Verification & Build
- File: `src/components/pos/SplitPaymentModal.test.tsx`
- Menambahkan assertion eksplisit untuk kelas Tailwind kontras tinggi pada member info card dan non-member info card.
- Menjalankan `npx vitest run`: 10 test files, 63 tests passed (100%).
- Menjalankan `npm run build`: Vite build sukses (exit code 0).



# Debug Session: DEBUG-20261030-PURCHASE-AUDIT-LOG-TABLE-NAME

## Status: FIXED

## Symptom
Saat menekan tombol "Simpan Perubahan" pada Modal Edit Faktur Pembelian di Manajemen Pembelian (`src/pages/admin/ManajemenPembelian.tsx`), muncul pesan error toast:
`"Gagal memperbarui faktur pembelian: null value in column "table_name" of relation "audit_logs" violates not-null constraint"`

**When:** Admin mengubah item, kuantitas, harga beli, atau nomor faktur pada modal edit faktur pembelian dan menekan "Simpan Perubahan".
**Expected:** Faktur dan item tersimpan di database, selisih stok master produk terhitung dan diperbarui secara atomik, audit log tercatat di tabel `public.audit_logs`, modal tertutup, dan notifikasi sukses ditampilkan.
**Actual:** Muncul error toast penolakan mutasi karena kolom `table_name` pada tabel `audit_logs` bernilai NULL melanggar not-null constraint.

## Root Cause
1. Tabel `public.audit_logs` pada database PostgreSQL mendefinisikan kolom wajib:
   - `table_name text NOT NULL`
   - `action text NOT NULL`
   - `record_id text NOT NULL`
   - `entity_name text NULL` (opsional)
2. Fungsi RPC PostgreSQL `update_purchase_invoice_atomic` pada `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql` melakukan `INSERT INTO public.audit_logs (...)` hanya dengan kolom `entity_name`, `entity_id`, `action`, `old_data`, `new_data`, `performed_by`, `performer_name`, `notes`, `created_at` tanpa menyertakan kolom `table_name` dan `record_id`.
3. Akibatnya, PostgreSQL mengevaluasi nilai default `table_name` menjadi NULL dan melempar exception:
   `null value in column "table_name" of relation "audit_logs" violates not-null constraint`.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Database Migration & RPC Alignment
- File: `supabase/migrations/023_purchase_audit_and_stock_adjustment.sql`, `supabase/migrations/024_fix_audit_logs_table_name_constraint.sql`
- Memperbarui skema tabel `public.audit_logs`:
  * Menambahkan kolom `table_name TEXT NOT NULL DEFAULT 'purchases'` dan `action TEXT NOT NULL DEFAULT 'UPDATE'`.
  * Menambahkan kolom `record_id TEXT`.
  * Menambahkan `DEFAULT 'purchases'` dan `DEFAULT 'UPDATE'` untuk mencegah null violation jika ada mutasi tanpa kolom tersebut.
  * Menambahkan index `idx_audit_logs_table_record ON public.audit_logs (table_name, record_id)`.
- Memperbarui fungsi RPC `update_purchase_invoice_atomic`:
  * Menyertakan kolom `table_name` ('purchases'), `action` ('UPDATE_PURCHASE'), dan `record_id` (`p_purchase_id::text`) secara eksplisit pada query `INSERT INTO public.audit_logs`.
- Menyediakan file migrasi mandiri `024_fix_audit_logs_table_name_constraint.sql` yang siap dijalankan langsung di SQL Editor Supabase untuk instance yang sudah berjalan.

### Wave 2: Service Layer & Audit Mutation Hardening
- File: `src/services/purchaseService.ts`, `src/services/auditService.ts`
- Membuat modul `src/services/auditService.ts`:
  * Fungsi `insertAuditLog()` yang memvalidasi dan memastikan `table_name` (default 'purchases'), `action` (default 'UPDATE'), dan `record_id` selalu terisi string non-null.
- Memperbarui `src/services/purchaseService.ts`:
  * Menambahkan properti opsional `table_name?: string` dan `record_id?: string` pada `PurchaseAuditLog`.
  * Menambahkan fungsi `recordPurchaseAuditLog()` yang menyisipkan audit log faktur dengan `table_name: 'purchases'` dan `record_id: purchaseId`.
  * Memperbarui `fallbackUpdatePurchaseInvoice()` agar audit log in-memory menyertakan `table_name: 'purchases'` dan `record_id: purchaseId`.
  * Memperbarui `getPurchaseAuditLogs()` agar mendukung pembacaan berbasis `entity_id` maupun `record_id`.

### Wave 3: Static & Build Verification
- File: `src/services/auditService.test.ts`, `src/services/purchaseService.test.ts`
- Membuat unit test `src/services/auditService.test.ts` untuk memverifikasi payload audit log mandatory field.
- Memperbarui `src/services/purchaseService.test.ts` untuk menguji `recordPurchaseAuditLog` dan verifikasi `table_name` serta `record_id`.
- Menjalankan `npx vitest run`: 13 test files, 91 tests passed (100%).
- Menjalankan `npm run build`: Vite build sukses dalam 844ms (exit code 0).



# Debug Session: DEBUG-20261030-PURCHASE-INVOICE-UUID-SYNTAX-4779

## Status: FIXED

## Symptom
Saat menekan tombol "Simpan Perubahan" pada Edit Faktur Pembelian di Manajemen Pembelian (`src/pages/admin/ManajemenPembelian.tsx`), muncul galat error toast:
`"Gagal memperbarui faktur pembelian: invalid input syntax for type uuid: '4779'"`

**When:** Pengguna atau admin menekan tombol "Simpan Perubahan" pada form modal Edit Faktur Pembelian.
**Expected:** Faktur pembelian dan stok master produk berhasil diperbarui, riwayat audit log tercatat, modal edit tertutup, notifikasi sukses muncul, dan tabel daftar faktur ter-refresh.
**Actual:** Proses gagal dengan pesan galat sintaksis UUID PostgreSQL `invalid input syntax for type uuid: '4779'`.

## Root Cause Analysis
1. String angka numerik `"4779"` dimasukkan ke dalam parameter RPC atau kolom database PostgreSQL yang bertipe `UUID`.
2. Pada `src/pages/admin/ManajemenPembelian.tsx`:
   - Jika pengguna aktif (`currentUser`) tidak memiliki sesi auth UUID standar (misal dev/offline ID atau ID numerik seperti `'4779'`), ID non-UUID tersebut dikirim ke service `updatePurchaseInvoice`.
   - Jika item faktur memiliki `produkId` bernilai non-UUID (seperti kode integer/SKU `"4779"` dari master data barang), ID non-UUID tersebut dikirim ke payload rincian item.
3. Pada `src/services/purchaseService.ts`:
   - Parameter `p_user_id` pada RPC `update_purchase_invoice_atomic` dikirimkan secara mentah tanpa validasi regex UUID standar (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`). Akibatnya, nilai seperti `"4779"` memicu PostgreSQL melempar `22P02: invalid input syntax for type uuid: '4779'`.
   - Pada `recordPurchaseAuditLog()`, kolom `performed_by` dan `entity_id` menerima ID non-UUID secara langsung.
4. Pada fungsi RPC database `update_purchase_invoice_atomic`:
   - Parameter `p_user_id` bertipe ketat `UUID` yang langsung gagal jika menerima teks non-UUID sebelum masuk ke fungsi.
   - Kolom `product_id` di-cast `::UUID` tanpa pengecekan format atau pencocokan SKU.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Audit Payload & UUID Validation
- File: `src/services/purchaseService.ts`, `src/pages/admin/ManajemenPembelian.tsx`
- Menambahkan fungsi helper `isValidUUID`:
  ```typescript
  export const isValidUUID = (str: unknown): str is string =>
    typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  ```
- Pada `src/services/purchaseService.ts`:
  * Sanitasi `p_user_id`: `isValidUUID(user?.id) ? user.id : null`.
  * Sanitasi `recordPurchaseAuditLog`: `performed_by: isValidUUID(user?.id) ? user.id : null`, `entity_id: isValidUUID(purchaseId) ? purchaseId : null`.
  * Menambahkan toleransi `code === '22P02'` dan pesan `invalid input syntax for type uuid` pada `shouldFallback()`.
- Pada `src/pages/admin/ManajemenPembelian.tsx`:
  * Saat modal dibuka (`handleOpenEditModal`) dan saat submit (`handleSubmitEditFaktur`), setiap `item.produkId` yang bernilai SKU atau numerik (seperti `"4779"`) otomatis dipetakan ke UUID master produk `products.find(p => p.id === it.produkId || p.sku === it.produkId)?.id`.
  * Nilai `userId` diverifikasi dengan `isValidUUID(currentUser?.id) ? currentUser!.id : ''`.

### Wave 2: Database RPC Resiliency & Direct Mutasi Fallback
- File: `supabase/migrations/025_safe_uuid_handling_purchase_update.sql`, `src/services/purchaseService.ts`
- Menghapus overload ganda dengan mengeksekusi `DROP FUNCTION IF EXISTS public.update_purchase_invoice_atomic(UUID, TEXT, DATE, JSONB, TEXT, TEXT, TEXT);` untuk mencegah galat PostgreSQL 42725 (`Could not choose the best candidate function between ...`).
- Menetapkan SATU-SATUNYA fungsi kanonik `update_purchase_invoice_atomic` dengan parameter `p_user_id UUID DEFAULT NULL`, penanganan lookup nomor faktur jika `p_purchase_id` tidak cocok, dan resolusi otomatis SKU ke `products.id` untuk item produk.
- Menambahkan kode `42725` dan pesan `could not choose the best candidate function` pada `shouldFallback()` di `purchaseService.ts`.
- Mengimplementasikan `executeDirectSupabasePurchaseUpdate()` pada service: jika RPC mengalami kegagalan/fallback, service langsung memuat faktur asli dari tabel `purchases` remote (baik lewat ID maupun invoice_number), menghitung delta stok, memperbarui tabel `products`, `purchase_items`, `purchases`, dan mencatat ke `audit_logs` secara langsung sehingga tidak pernah melempar false positive "Faktur tidak ditemukan" dari in-memory mock.

### Wave 3: Test Verification & Build
- File: `src/services/purchaseService.test.ts`
- Menambahkan unit test untuk helper `isValidUUID` (valid UUID vs '4779', non-UUID, null, empty string).
- Menambahkan unit test untuk sanitasi `p_user_id` pada RPC saat menerima non-UUID `"4779"`.
- Menambahkan unit test untuk sanitasi `recordPurchaseAuditLog` saat menerima ID non-UUID / numerik `"4779"`.
- Hasil pengujian:
  * `src/services/purchaseService.test.ts`: 22 tests passed (100%).
  * Full test suite: 13 test files, 95 tests passed (100%).
  * Build produksi (`npm run build`): sukses (exit code 0).

---

# Debug Session: DEBUG-20261031-POS-QTY-F4

## Status: FIXED

## Symptom
Pada halaman kasir POS (`/admin/kasir` atau `/pos`), saat menekan hotkey F4 (atau klik tombol "F4 Qty" di header POS):
- Dialog modal "Kuantitas (Qty)" muncul untuk mengubah kuantitas item terakhir di keranjang.
- Bug: Nilai yang diinputkan di modal tidak langsung menjadi kuantitas item, melainkan mengalami perhitungan salah (misal: Qty awal 1, diinput angka 5, hasil akhir menjadi 11).

**When:** Saat menekan F4 pada item yang sudah ada di keranjang kasir, menginputkan angka baru, dan menekan Enter atau klik Simpan.
**Expected:** Kuantitas item di keranjang belanja langsung tergantikan (*exact replacement*) menjadi nilai yang diinputkan (misal: 5).
**Actual:** Kuantitas terhitung secara keliru menjadi 11 (`1 + 5 + 5`).

## Root Cause
1. **Additive Mutation on Edit Mode**: Handler `handleConfirmQty` di `src/pages/pos/index.tsx` selalu menjalankan mutasi penambahan `next[existing].qty += qty` tanpa membedakan apakah modal dibuka untuk menambah produk baru dari katalog/scan (`mode: 'add'`) atau memodifikasi item keranjang via F4 (`mode: 'edit'`). Akibatnya, angka baru ditambahkan ke kuantitas awal alih-alih menggantikannya (`1 + 5 = 6`).
2. **Double Triggering on Enter Key**: Pada `src/components/pos/QuantityModal.tsx`, listener `onKeyDown` pada input menangani `Enter` dengan memanggil `onConfirm(qty)`, namun tidak memanggil `e.stopPropagation()` dan tombol Simpan tidak memiliki `type="button"`. Hal ini memicu event ganda saat Enter ditekan (input keydown + default button click), sehingga `onConfirm(5)` terpanggil dua kali: `1 + 5 + 5 = 11`.
3. **Missing Current Quantity Pre-fill**: `QuantityModal` menginisialisasi state kuantitas selalu dengan hardcoded `1` (`setQty(1)`) daripada membaca `item.qty` yang sedang aktif di keranjang.
4. **Header F4 Button Stale Target**: Tombol "F4 Qty" di `POSHeader` tidak memanggil `setActiveItemForQty(cart[cart.length - 1])`, menyebabkan target item berpotensi null atau item lama jika dibuka via klik tombol.

## Solusi & Implementasi (GSD Framework)

### Wave 1: Fix Quantity Modal & Cart Mutation Logic
- File: `src/components/pos/QuantityModal.tsx`
  * Menambahkan prop `mode?: 'add' | 'edit'` (judul modal dinamis: "Ubah Kuantitas (Qty)" saat edit).
  * Mengisi nilai default kuantitas dari `item.qty` jika tersedia (`'qty' in item && typeof item.qty === 'number' && item.qty > 0 ? item.qty : 1`) dan auto-select teks saat modal terbuka.
  * Membungkus konten ke dalam `<form onSubmit={handleConfirm}>`.
  * Memastikan fungsi konfirmasi memanggil `e.preventDefault()` dan `e.stopPropagation()`.
  * Menetapkan atribut `type="button"` pada seluruh tombol (Close, Minus, Plus, Batalkan, Simpan) untuk mencegah eksekusi ganda pada event Enter.
- File: `src/pages/pos/index.tsx`
  * Menambahkan state `qtyModalMode` (`'add' | 'edit'`).
  * Pada shortcut F4 dan tombol "F4 Qty" di `POSHeader`: menetapkan `qtyModalMode = 'edit'` dan `setActiveItemForQty(cart[cart.length - 1])`.
  * Pada seleksi produk dari katalog/search (`handleSelectProduct`): menetapkan `qtyModalMode = 'add'`.
  * Memperbarui `handleConfirmQty`:
    - Jika `qtyModalMode === 'edit'`: melakukan *exact replacement* `next[existing].qty = parsedQty`.
    - Jika `qtyModalMode === 'add'`: melakukan akumulasi `next[existing].qty += parsedQty`.
- File: `src/lib/cartStore.ts`
  * Menambahkan alias eksplisit `setQuantity(id, qty)` yang memanggil `updateQty(id, qty)`.

### Wave 2: Verification, Test Suite & Build
- File: `src/components/pos/QuantityModal.test.tsx`
  * Menambahkan unit test suite untuk menguji rendering saat `isOpen` false (null), rendering mode 'add' vs 'edit', keberadaan atribut `type="button"` pada semua tombol, serta simulasi logika penggantian kuantitas F4 (`applyQtyChange` menghasilkan tepat 5 dari nilai awal 1, dan idempoten pada pemanggilan ganda).
- Hasil pengujian:
  * `QuantityModal.test.tsx`: 6 tests passed (100%).
  * Typecheck (`tsc --noEmit`): exit code 0.
  * Full test suite (`npx vitest run`): 19 test files, 199/199 tests passed (100%).
  * Production build (`npm run build`): sukses (exit code 0).


