---
milestone: SIMKOP v1.0
version: 1.0.0
updated: 2026-10-30T20:50:00+07:00
---

# Roadmap

> **Current Phase:** 35 — Penyelarasan Tombol Export Excel & Cetak PDF Laporan Mutasi Barang
> **Status:** ⏳ In Progress

## Must-Haves (from SPEC)

- [ ] 2-role system (admin, operator) with dynamic restrictions via `user_restrictions`
- [ ] Pinjaman 0% bunga — tanpa kalkulator flat/anuitas
- [ ] Kasir dengan fitur pending transaksi (`parked_notes`)
- [ ] Pencatatan restock dengan nomor faktur supplier
- [ ] UI mengikuti Stitch design tokens (SIMKOP Design System)

## Explicit Exclusions

- ❌ Modul Akuntansi SAK / SAK-ETAP / SAK-EP
- ❌ Kalkulator bunga pinjaman (flat / anuitas / efektif)
- ❌ Auto-journaling / Chart of Accounts / Buku Besar
- ❌ Kalkulasi SHU otomatis
- ❌ Portal mandiri anggota (mobile web view) — deferred
- ❌ Payment gateway bank integration — deferred
- ❌ Multi-role kompleks (pengurus, pengawas, manajer logistik) — cukup admin & operator

---

## Phases

### Phase 1: Project Foundation & Design System
**Status:** ✅ Complete
**Objective:** Membangun fondasi teknis aplikasi — inisialisasi project web app, implementasi design system dari Stitch tokens, dan struktur folder komponen.

**Plans:**
- [x] Plan 1.1: Inisialisasi project (Vite + React/vanilla), konfigurasi build tools
- [x] Plan 1.2: Implementasi CSS design system dari Stitch tokens (warna, tipografi, spacing, elevation, shapes, komponen dasar)
- [x] Plan 1.3: Buat layout shell — sidebar navigation (280px rail), responsive breakpoints (desktop/tablet/mobile), dan app skeleton

**Deliverables:**
- App skeleton berjalan di `localhost` dengan design system terpasang
- Sidebar navigasi responsif dengan placeholder menu items
- Semua design tokens tersedia sebagai CSS custom properties

---

### Phase 2: Autentikasi & Manajemen User
**Status:** 🔄 In Progress
**Objective:** Implementasi login, registrasi, dan sistem role/permission berdasarkan skema Supabase (`admin`, `operator`, `user_restrictions`).
**Depends on:** Phase 1

**Plans:**
- [x] Plan 2.1: Halaman Login — port dari Stitch "Login SIM Koperasi" screen, integrasi Supabase Auth
- [x] Plan 2.2: Registrasi user baru (admin-only action) dengan pemilihan role (admin/operator)
- [x] Plan 2.3: Middleware auth guard + dynamic restriction engine dari tabel `user_restrictions` (partial implementation via ProtectedRoute)
- [x] Plan 2.4: Halaman manajemen user — CRUD user, assign role, kelola restrictions

**Deliverables:**
- Login/logout fungsional dengan Supabase
- Role-based route protection (admin vs operator)
- Admin dapat membuat user baru dan mengatur pembatasan dinamis

---

### Phase 3: Modul Kasir (POS) & Parked Notes
**Status:** ✅ Complete
**Objective:** Membangun antarmuka Point of Sale (kasir) dengan fitur pending transaksi (`parked_notes`), pembayaran tunai, dan cetak struk.
**Depends on:** Phase 2

**Plans:**
- [x] Plan 3.1: Layout POS — split-screen (katalog produk kiri, keranjang/checkout kanan), barcode input field
- [x] Plan 3.2: Keranjang belanja — tambah/hapus item, edit qty, kalkulasi subtotal/total (tabular numerics)
- [x] Plan 3.3: Fitur Parked Notes — park transaksi sementara, list parked notes, resume transaksi
- [x] Plan 3.4: Proses checkout — pembayaran tunai, kalkulasi kembalian, simpan transaksi ke Supabase
- [x] Plan 3.5: Cetak struk (thermal print layout / PDF receipt)

**Deliverables:**
- Kasir dapat memproses transaksi end-to-end
- Transaksi dapat di-park dan di-resume
- Struk transaksi dapat dicetak/diunduh

---

### Phase 4: Modul Pinjaman (0% Bunga) & Simpanan
**Status:** ✅ Complete
**Objective:** Mengelola simpanan anggota dan pinjaman tanpa bunga — pengajuan, persetujuan, jadwal angsuran, dan monitoring pelunasan.
**Depends on:** Phase 2

**Plans:**
- [ ] Plan 4.1: Dashboard simpanan anggota — Simpanan Pokok, Simpanan Wajib, saldo (read-only untuk operator)
- [ ] Plan 4.2: Pengajuan pinjaman baru — form sederhana (jumlah pinjaman, tenor cicilan), tanpa bunga
- [ ] Plan 4.3: Approval workflow — admin menyetujui/menolak pengajuan pinjaman
- [ ] Plan 4.4: Jadwal angsuran & pencatatan pembayaran cicilan — tracking pelunasan per periode
- [ ] Plan 4.5: Status badges (Lunas / Berjalan / Jatuh Tempo) menggunakan Stitch chip components

**Deliverables:**
- Anggota terdaftar dengan saldo simpanan
- Pinjaman 0% dapat diajukan, disetujui, dan dilunasi secara bertahap
- Status pinjaman terpantau dengan visual badges

---

### Phase 5: Modul Inventori, Restock & Dashboard
**Status:** ✅ Complete
**Objective:** Manajemen stok barang, pencatatan restock dengan nomor faktur supplier, dan dashboard ringkasan operasional.
**Depends on:** Phase 3

**Plans:**
- [x] Plan 5.1: Katalog produk — CRUD produk (nama, barcode/SKU, harga jual, stok saat ini)
- [x] Plan 5.2: Pencatatan restock — form input (produk, qty, harga beli, **nomor faktur supplier**, tanggal)
- [x] Plan 5.3: Kartu stok & riwayat pergerakan stok per produk
- [x] Plan 5.4: Peringatan stok minimum (low stock alert)
- [x] Plan 5.5: Dashboard operasional — ringkasan penjualan hari ini, total pinjaman aktif, stok kritis, parked notes count

**Deliverables:**
- Produk terdaftar dengan stok real-time
- Setiap restock tercatat dengan nomor faktur supplier
- Dashboard memberikan overview operasional harian

### Phase 6: Manajemen Anggota Koperasi
**Status:** ✅ Complete
**Objective:** Mengelola data induk anggota koperasi (CRUD Anggota).
**Depends on:** Phase 2

**Plans:**
- [x] Plan 6.1: Service functions CRUD Anggota
- [x] Plan 6.2: UI Tabel & Routing
- [x] Plan 6.3: UI Modal Form CRUD Anggota

**Deliverables:**
- Halaman Manajemen Anggota berfungsi penuh untuk Tambah, Edit, Hapus, dan Lihat daftar anggota.

---

### Phase 7: Backup Database
**Status**: ✅ Complete
**Objective**: Menambahkan fungsi export data ke format Excel dan PDF.
**Depends on**: Phase 6

**Tasks**:
- [x] Plan 7.1: Master Data Export (Anggota & Produk)
- [x] Plan 7.2: Export Transaksi dan Pinjaman (Excel & PDF)

**Verification**:
- [x] Tombol export (Excel/PDF) tersedia di modul Pinjaman, Riwayat Transaksi, Anggota, Produk.
- [x] Data yang diexport mencerminkan data aktual di tabel antarmuka.

---

### Phase 8: Konfigurasi & Fleksibilitas Simpan Pinjam Dinamis
**Status**: ✅ Complete
**Objective**: Memungkinkan pembuatan jenis simpanan dan pinjaman secara dinamis dengan persyaratannya masing-masing, mendukung pembayaran cicilan parsial, dan melacak status pelunasan komitmen bulanan.
**Depends on**: Phase 4, Phase 7

**Plans**:
- [x] Plan 8.1: Migrasi skema database & update service layer ke tabel bahasa Inggris (`deposit_types`, `loans`, dll).
- [x] Plan 8.2: Modul Admin - CRUD Jenis Simpanan (`deposit_types`) & Jenis Pinjaman (`loan_types`).
- [x] Plan 8.3: Refaktor UI Simpanan - Mendukung multiple jenis simpanan per anggota & pembayaran parsial per bulan.
- [x] Plan 8.4: Refaktor UI Pinjaman - Mendukung multiple jenis pinjaman, tenor dinamis, & cicilan angsuran parsial per bulan.
- [x] Plan 8.5: Dashboard Analytics - Menampilkan tracking status komitmen bulanan (Lunas / Belum Lunas).

---

### Phase 9: Modul Pinjaman Komprehensif (THP & FIFO)
**Status**: ⬜ Not Started
**Objective**: Implementasi siklus pinjaman lengkap dengan validasi THP (Take Home Pay), penjadwalan angsuran otomatis (loan_schedules), dan sistem pembayaran fleksibel menggunakan logika alokasi FIFO.
**Depends on**: Phase 8

**Plans**:
- [x] Plan 9.1: Database Schema & Migrations — `loans`, `loan_schedules`, `loan_repayments`.
- [x] Plan 9.2: Service Layer (THP Validation & Submission) — Validasi Sisa THP >= 1.500.000 dan pengajuan pinjaman.
- [x] Plan 9.3: Service Layer (Approval & Scheduling) — Auto-generate `n` baris jadwal angsuran berdasarkan tenor saat disetujui.
- [x] Plan 9.4: Service Layer (Payment Handler & FIFO) — Logika pembayaran dengan alokasi FIFO, penanganan overpayment, dan pelunasan awal.
- [x] Plan 9.5: Unit & Integration Testing — Skenario THP tidak cukup, bayar parsial, overpayment, dan full payoff.
- [x] Plan 9.6: Frontend UI (Pengajuan Pinjaman) — Form pengajuan pinjaman dengan kalkulator validasi THP real-time.
- [x] Plan 9.7: Frontend UI (Approval & Detail) — Layar persetujuan admin dan detail pinjaman dengan histori angsuran/FIFO payment modal.

---

### Phase 10: Export Template and Salary-Account Reconciliation Import
**Status**: ✅ Complete
**Objective**: Implementasi sistem rekonsiliasi gaji dan rekening anggota via upload/download template Excel.
**Depends on**: Phase 9

**Plans**:
- [x] Plan 10.1: (Wave 1) Database schema adjustment & audit log table
- [x] Plan 10.2: (Wave 1) Export template xlsx service & endpoint
- [x] Plan 10.3: (Wave 2) Upload parser with instant file deletion and staging classifier
- [x] Plan 10.4: (Wave 2) Batch reconciliation confirmation handler with DB Transaction

---

### Phase 11: Buku Pembantu & Kliring Penyelesaian Hak-Kewajiban Anggota Keluar
**Status**: ✅ Complete
**Objective**: Mengimplementasikan fitur Member Settlement & Clearance untuk menghitung hak bersih simpanan vs kewajiban sisa pinjaman saat anggota mengundurkan diri.
**Depends on**: Phase 8, Phase 9

**Plans**:
- [x] Plan 11.1: (Wave 1) Create Settlement Service & SQL Aggregation Queries
- [x] Plan 11.2: (Wave 2) Build Member Settlement Ledger Page and Cards
- [x] Plan 11.3: (Wave 3) Add Printable Clearance Sheet and Finalize Action

---

### Phase 12: Member Resignation Settlement Actions (Instant Payoff & Debtor Transition)
**Status**: ✅ Complete
**Objective**: Mengimplementasikan alur interaktif tombol "Proses Pengunduran Diri" dengan opsi pelunasan seketika atau transisi ke piutang eks-anggota jika terjadi defisit.
**Depends on**: Phase 11

**Plans**:
- [x] Plan 12.1: (Wave 1) Migration & Settlement Execution Service
- [x] Plan 12.2: (Wave 2) Build Clearance Action Modal & Wire Button
- [x] Plan 12.3: (Wave 2) Auto-Detection for Final Resignation Approval

---

### Phase 13: Refactoring Modul Kasir (POS) SIMKOP Enterprise
**Status**: ✅ Complete
**Objective**: Keyboard-First POS, Multi-Device Scanner Support (Camera/Bluetooth/Keyboard), and Stateless Receipt Delivery
**Depends on**: Phase 3

**Plans**:
- [x] Plan 13.1: (Wave 1) Generate POS Layout & Modals using Stitch MCP
- [x] Plan 13.2: (Wave 1) Implement Keyboard Navigation & Autocomplete Selection
- [x] Plan 13.3: (Wave 2) Quantity Autofocus Modal with Strict Keyboard Escape/Enter
- [x] Plan 13.4: (Wave 2) Mobile HTML5 Camera Barcode Scanner Modal
- [x] Plan 13.5: (Wave 3) Stateless Receipt Handlers (Direct Thermal, WA Link, Client PDF)

---

### Phase 14: Product Categories Excel Template Export and Batch Import
**Status**: ✅ Complete
**Objective**: Export Template Excel (.xlsx) Kategori & Import Batch Kategori Produk ke public.product_categories
**Depends on**: Phase 1

**Plans**:
- [x] Plan 14.1: (Wave 1) Template Export & Stateless Upload Parser Logic
- [x] Plan 14.2: (Wave 2) Category Management UI Action Buttons and Confirmation Modal

---

### Phase 15: Product Catalog Excel Template Export and Batch Import
**Status**: ✅ Complete
**Objective**: Export Template Excel (.xlsx) Produk & Batch Import Katalog Produk ke public.products dengan Auto-Category Matching
**Depends on**: Phase 1, Phase 5

**Plans**:
- [x] Plan 15.1: (Wave 1) Template Export & Stateless Upload Parser Logic for Products
- [x] Plan 15.2: (Wave 2) Product Catalog UI Action Buttons and Confirmation Modal

---

### Phase 16: Dashboard Laporan Keuangan Terpadu
**Status**: ✅ Complete
**Objective**: Membangun modul `/admin/laporan-keuangan` — Dashboard Keuangan Terpadu dengan dua tab: (1) Laporan Arus Kas Komprehensif (Cash Flow Statement) dan (2) Estimasi SHU Berjalan (Projected Net Operating Surplus) — terintegrasi dengan Stitch MCP untuk UI generation dan Supabase untuk agregasi data real-time.
**Depends on**: Phase 5, Phase 8, Phase 9

**Plans**:
- [x] Plan 16.1: (Wave 1) Generate Financial Reports Dashboard UI via Stitch MCP — breadcrumb, date range toolbar, tab switcher, metric cards, tabel arus kas, waterfall SHU cards, widget alokasi RAT.
- [x] Plan 16.2: (Wave 2) Build Cashflow & SHU Aggregation Service Layer — Supabase queries untuk `/api/reports/cash-flow` dan `/api/reports/shu-estimation` dengan formula HPP (SUM qty × buy_price), laba kotor, dan estimasi SHU bersih.
- [x] Plan 16.3: (Wave 3) Connect UI State, Sidebar Navigation & Export Handlers — reaktivitas filter tanggal, sidebar link, export Excel (.xlsx via exceljs), dan cetak PDF client-side.

**Verification**:
- Buka `/admin/laporan-keuangan`, ganti filter tanggal → data metric cards dan tabel reload otomatis.
- Switch antar tab Arus Kas ↔ Estimasi SHU tanpa error.
- Tombol Export Excel mengunduh file `.xlsx` dengan angka yang sinkron dengan tampilan.
- Kalkulasi HPP, Laba Kotor, dan Estimasi SHU sesuai formula business rules.

---

### Phase 17: Dashboard Laporan Retail & Inventori POS
**Status**: ✅ Complete
**Objective**: Mengimplementasikan modul `/admin/laporan-retail` — Laporan Penjualan (Tutup Kasir Harian), Produk Terlaris & Margin Laba, serta Status Stok & Valuasi Inventori.
**Depends on**: Phase 16

**Plans**:
- [x] Plan 17.1: (Wave 1) Generate Retail & Inventory Reports Dashboard with Stitch MCP
- [x] Plan 17.2: (Wave 2) Build Endpoints for End-of-Day, Fast-Moving Margin, and Stock Valuation
- [x] Plan 17.3: (Wave 3) Wire Frontend State, Sidebar Navigation, and Stateless Exporter

**Verification**:
- Pastikan antarmuka ter-generate rapi dengan Tailwind CSS.
- Verifikasi pemisahan pembayaran tunai/deposit/bon dan kalkulasi akurat via API.
- Buka `/admin/laporan-retail`, verifikasi tabel inventori dan export Excel bekerja di sisi klien.

---

### Phase 18: Refactor Native Browser Dialogs to React Modal & Toast System
**Status**: ✅ Complete
**Objective**: Memigrasikan seluruh pemanggilan browser alerts (window.alert, alert), konfirmasi (window.confirm, confirm), dan prompt dari aplikasi ke sistem React Feedback Modal dan Toast terpadu yang aman dari pemblokiran browser.
**Depends on**: Phase 17

**Plans**:
- [x] Plan 18.1: (Wave 1) Global Feedback UI Infrastructure (Toast & Confirm Modal System)
- [x] Plan 18.2: (Wave 2) Refactor Native Browser Dialogs in Admin Module Pages
- [x] Plan 18.3: (Wave 2) Refactor POS Module & Standalone Utilities Dialogs

**Verification**:
- FeedbackProvider terpasang dan dapat diakses dari seluruh route/komponen.
- 0 instance alert(, confirm(, atau prompt( di codebase src/.
- npm run build sukses dan unit tests lulus tanpa regresi.

---

### Phase 19: Implementasi Fitur Download PDF Struk Transaksi POS
**Status**: ✅ Complete
**Objective**: Mengaktifkan fungsi download PDF struk kasir client-side dengan format ukuran struk thermal POS (80mm) menggunakan jsPDF, menggantikan pesan toast placeholder di ReceiptModal dan mengintegrasikan nomor transaksi serta detail pembayaran.
**Depends on**: Phase 18

**Plans**:
- [x] Plan 19.1: Implementasi Engine Generator PDF Struk POS & Integrasi Modal Kasir

**Verification**:
- Tombol "Download PDF" pada modal struk memicu download file PDF struk thermal (80mm).
- Struk PDF memuat data transaksi lengkap: identitas koperasi, no invoice, kasir/anggota, rincian barang, total, metode split payment, dan kembalian.
- Build TypeScript dan unit test lulus tanpa error.

---

### Phase 20: Manajemen Profil Koperasi & Konfigurasi Header Struk POS
**Status**: ✅ Complete
**Objective**: Membangun modul manajemen profil koperasi di dashboard admin dan mengintegrasikan profil dinamis ke seluruh output struk POS (modal tampilan thermal, download PDF, dan WhatsApp). Memperbaiki layout bug penumpukan teks pada header PDF dan tampilan struk kasir saat alamat panjang.
**Depends on**: Phase 19

**Plans**:
- [x] Plan 20.1: Manajemen Profil Koperasi & Konfigurasi Header Struk POS

**Verification**:
- Tersedia migrasi SQL `017_create_app_settings.sql` dengan constraint single row dan RLS.
- Admin dapat mengubah nama, alamat, telp, terminal, dan footer di `/admin/pengaturan`.
- Live preview mini struk merespons ketikan form pengaturan secara real-time.
- Tampilan struk kasir, PDF download, dan WhatsApp sharing menggunakan data profil koperasi yang disimpan di database.
- Bug teks menabrak/tumpang tindih pada alamat & telepon struk thermal/PDF teratasi sepenuhnya.
- Build TypeScript dan unit test lulus tanpa error.

---

### Phase 21: Resolusi Error Schema Cache koperasi_profile & Migrasi Tabel Profil Koperasi
**Status**: ✅ Complete
**Objective**: Mengatasi galat PostgREST "Could not find the table 'public.koperasi_profile' in the schema cache" dengan menyediakan skrip DDL SQL `017_create_koperasi_profile.sql`, serta mengimplementasikan graceful offline fallback (localStorage) pada service layer dan user feedback banner di admin panel.
**Depends on**: Phase 20

**Plans**:
- [x] Plan 21.1: Pembuatan DDL migrasi SQL, service layer resilient dengan offline fallback, dan visual notification banner

**Verification**:
- Berkas migrasi `supabase/migrations/017_create_koperasi_profile.sql` siap dijalankan di Supabase SQL Editor dengan constraint single row (`id = 1`) dan RLS policy lengkap.
- `settingsService.ts` memiliki fallback offline ganda (`localStorage` & default), mencegah uncaught error saat tabel Supabase belum termigrasi.
- Halaman admin `PengaturanKoperasi.tsx` menampilkan banner informatif mode lokal dan notifikasi toast yang jelas ketika tabel belum ada di database.
- 20 unit tests lulus dan build Vite sukses.

---

### Phase 22: Tahan Transaksi POS (F8), Auto-Expire Restock & Pengaturan Kasir
**Status**: ✅ Complete
**Objective**: Mengganti hotkey Tahan Transaksi dari F12 ke F8 (menghapus shortcut F8 Diskon yang tidak digunakan) guna menghindari konflik Developer Tools browser. Menyediakan modal daftar transaksi tertahan dengan aksi Reload dan Hapus, sistem auto-expire dengan pengembalian stok barang otomatis ke inventory (RPC cleanup), dan halaman Pengaturan Kasir untuk konfigurasi timeout tahan barang.
**Depends on**: Phase 21

**Plans**:
- [x] Plan 22.1: Migrasi skema database (pos_settings & RPC cleanup_expired_parked_sales) dan resilient service layer posSettingsService
- [x] Plan 22.2: Halaman admin Pengaturan Kasir dan integrasi navigasi Sidebar/App routing
- [x] Plan 22.3: Refaktor hotkey POS (F8), modal belanja ditahan (ParkedTransactionsModal), serta alur simpan/muat/hapus dengan restock inventori
- [x] Plan 22.4: Pengujian unit test posSettingsService dan verifikasi build integritas aplikasi

**Verification**:
- File migrasi `018_pos_settings_and_parked_auto_expire.sql` siap dijalankan dengan tabel `pos_settings`, kolom `expires_at`, dan RPC `cleanup_expired_parked_sales()`.
- Service layer `posSettingsService.ts` memiliki fallback offline ganda (`localStorage` & default), mencegah exception saat tabel Supabase belum termigrasi.
- Halaman admin `/admin/pengaturan-kasir` dapat mengubah konfigurasi timeout hold transaksi dan status persistensinya tersimpan rapi.
- Hotkey F8 di POS memicu penahanan transaksi tanpa membuka browser Developer Tools, tombol F8 Diskon dihapus dari header.
- Modal belanja ditahan menampilkan daftar transaksi, sisa waktu/status expired, tombol Muat Kembali (Reload) mengembalikan item ke kasir, dan tombol Hapus mengembalikan stok ke inventory.
- Auto-expire memulihkan stok inventori ketika waktu tahan transaksi melampaui batas waktu.
- Unit tests lulus 100% dan build Vite sukses.

---

---

### Phase 23: Relokasi Menu Laporan Retail & Stok ke Kelompok Toko Retail & Inventori
**Status**: ✅ Complete
**Objective**: Memindahkan item navigasi menu "Laporan Retail & Stok" (/admin/laporan-retail) dari seksi "LAPORAN & ANALITIK" ke seksi "TOKO RETAIL & INVENTORI" (tepat di bawah "Pengaturan Kasir") pada sidebar admin untuk alur kerja operasional retail yang lebih terintegrasi.
**Depends on**: Phase 22

**Plans**:
- [x] Plan 23.1: Relokasi item navigasi Laporan Retail & Stok di Sidebar.tsx
- [x] Plan 23.2: Validasi tipe TypeScript dan build integritas aplikasi

**Verification**:
- Menu "Laporan Retail & Stok" tampil di bawah "Pengaturan Kasir" pada seksi "TOKO RETAIL & INVENTORI".
- Menu tersebut tidak lagi muncul di bawah seksi "LAPORAN & ANALITIK".
- Kompilasi build npm run build sukses (exit code 0).

---

### Phase 24: Shift Buka & Tutup Kasir dengan Rekonsiliasi Kas Kecil POS
**Status**: ✅ Complete
**Objective**: Mengimplementasikan siklus shift operasional kasir (Buka Shift dengan modal kas kecil awal dan Tutup Shift dengan rekonsiliasi uang fisik aktual vs penjualan kas), penyekatan operasional kasir sebelum buka shift, pencatatan mutasi mutasi kas ke tabel `cash_flow`, dan integrasi laporan rekonsiliasi di Laporan Retail.
**Depends on**: Phase 22, Phase 23

**Plans**:
- [x] Plan 24.1: Skema Database cashier_shifts & Service Layer Mutasi Kasir
- [x] Plan 24.2: UI Modals Buka & Tutup Kasir serta Route Guard POS
- [x] Plan 24.3: Integrasi Laporan Retail & Rekonsiliasi, Unit Test & Build Verification

**Verification**:
- Tabel `cashier_shifts` dan relasi `sales.shift_id` terdefinisi di Supabase migration.
- `cashierShiftService.ts` mengelola pembukaan, rekonsiliasi, penutupan, dan mutasi `cash_flow` dengan dual-layer fallback.
- Modal Buka & Tutup Kasir berfungsi di POS, transaksi checkout diblokir sebelum buka shift.
- Tab 1 Laporan Retail memuat riwayat sesi shift kasir dan rekonsiliasi selisih kas.
- Seluruh unit tests vitest dan build produksi Vite (`npm run build`) sukses tanpa error.

---

### Phase 25: Batasi Metode Pembayaran Khusus Tunai untuk Non-Anggota di POS Kasir
**Status**: ✅ Complete
**Objective**: Membatasi metode pembayaran pada kasir POS agar pembeli Non-Anggota (pembeli umum) hanya diperbolehkan menggunakan metode Tunai.
**Depends on**: Phase 13, Phase 24

**Plans**:
- [x] Plan 25.1: Wave 1 - Quick Payment Buttons Guard & Non-Member Mode Sync
- [x] Plan 25.2: Wave 2 - Split Payment Modal Restriction for Non-Members
- [x] Plan 25.3: Wave 3 - Service Validation & Regression Tests

**Verification**:
- Pada tab Non-Anggota, tombol Potong Simpanan dan Bon Toko terkunci dan disabled.
- Modal Split Payment F9 mengunci input Simpanan & Bon Toko di angka 0 dan auto-focus pada Tunai.
- posCheckoutService menolak transaksi non-anggota jika terdapat komponen pembayaran non-tunai.
- Vitest tests lulus dan build Vite (npm run build) sukses tanpa error.

---

### Phase 26: Konfigurasi Dinamis Persentase Diskon Anggota di Pengaturan Kasir POS
**Status**: ✅ Complete
**Objective**: Menambahkan pengaturan persentase diskon anggota ke tabel `pos_settings`, menyediakan input persentase di menu admin `Pengaturan Kasir`, serta menghubungkannya secara reaktif ke modul POS kasir (keranjang, parked sales, modal struk kasir, cetak thermal, dan struk PDF).
**Depends on**: Phase 22, Phase 25

**Plans**:
- [x] Plan 26.1: Wave 1 - Database Migration & POS Settings Service Layer
- [x] Plan 26.2: Wave 2 - Admin POS Settings UI (Input Persentase Diskon Anggota)
- [x] Plan 26.3: Wave 3 - POS Dynamic Discount Integration (Cart, Parked Sales, Summary Panel & Receipts)
- [x] Plan 26.4: Wave 4 - Unit Tests & Build Verification
- [x] Plan 26.5: Wave 1 - Gap Closure (Hide Member Discount Row in POS SummaryPanel When Discount is Zero or Non-Member)

**Verification**:
- Kolom member_discount_percentage ada di pos_settings dengan default 5.0.
- Input persentase diskon anggota di halaman Pengaturan Kasir dapat diedit dan disimpan (ke DB & localStorage).
- POS kasir dan kalkulasi keranjang menggunakan persentase diskon dinamis dari pos_settings (bukan hardcoded 5%).
- Ringkasan POS, Struk Transaksi Selesai, dan Struk PDF mencetak persentase diskon sesuai nilai pengaturan (misal: "Diskon Anggota (10%):").
- Jika persentase 0% atau transaksi Non-Anggota, baris diskon anggota disembunyikan.
- Semua unit test Vitest lulus dan `npm run build` sukses 0 error.

---

### Phase 27: Perbaiki Fitur Cetak PDF Laporan Retail & Inventori Toko
**Status**: ✅ Complete
**Objective**: Mengganti implementasi cetak PDF berbasis window.print() di menu Laporan Retail (/admin/laporan-retail) dengan rendering tabel dokumen PDF mandiri menggunakan jspdf dan jspdf-autotable, merender header koperasi, kartu ringkasan omzet, dan tabel log transaksi lengkap beserta total agregasi footer.
**Depends on**: Phase 17, Phase 20

**Plans**:
- [x] Plan 27.1: Wave 1 - Implement Tabular Retail Report PDF Generator with jsPDF-AutoTable
- [x] Plan 27.2: Wave 2 - Connect Button Handler & Toast Feedback in Laporan Retail Page
- [x] Plan 27.3: Wave 3 - Build, Static Validation & Regression Tests

**Verification**:
- Tombol "Cetak PDF" pada /admin/laporan-retail mengunduh berkas PDF lanskap tanpa memicu dialog cetak browser (window.print()).
- Berkas PDF memuat nama koperasi, judul periode, ringkasan rekonsiliasi, serta tabel log transaksi penjualan.
- Kolom nominal terformat rapi dan baris footer memuat total agregasi rekonsiliasi.
- Notifikasi toast sukses muncul saat PDF berhasil digenerate.
- Unit test vitest lulus dan build produksi Vite (npm run build) exit code 0.

---

### Phase 28: Tampilkan Identitas & Nama Anggota Aktif pada Modal Pembayaran Kasir (F9)
**Status**: ✅ Complete
**Objective**: Menampilkan kartu banner identitas pembeli secara tegas di bagian atas modal penerimaan pembayaran kasir (Split Payment F9) di `SplitPaymentModal.tsx`, menampilkan nama lengkap anggota, nomor anggota / NRP, dan badge status keanggotaan (atau badge Non-Anggota jika pelanggan umum), serta meneruskan prop `selectedMember` dari halaman kasir utama di `src/pages/pos/index.tsx`.
**Depends on**: Phase 13, Phase 25

**Plans**:
- [x] Plan 28.1: Wave 1 - Pass Member Data & Render Header Info in Payment Modal
- [x] Plan 28.2: Wave 2 - Build, Unit Testing & Static Validation

**Verification**:
- Buka modal F9 saat anggota dipilih: modal menampilkan nama lengkap anggota, nomor NRP/ID, dan badge "Anggota Koperasi".
- Buka modal F9 saat non-anggota (pelanggan umum) dipilih: modal menampilkan keterangan "Transaksi Non-Anggota (Pelanggan Umum)" dan badge "Umum".
- State `selectedMember` diteruskan secara tepat dari `src/pages/pos/index.tsx`.
- Unit tests di `SplitPaymentModal.test.tsx` lulus dan Vite build `npm run build` sukses 0 error.

---

### Phase 29: Refactor Template & Parser Import Produk Tanpa Kolom Kategori
**Status**: ✅ Complete
**Objective**: Menghapus kolom 'kategori' dari template Excel produk (`template_katalog_produk.xlsx`), menyesuaikan template menjadi 7 kolom standar (`sku, nama_produk, satuan, harga_beli, harga_jual, stok_awal, min_stok_alert`), serta memperbarui service parser import agar memasukkan data produk dengan `category_id = null` tanpa memicu error validasi kategori.
**Depends on**: Phase 15

**Plans**:
- [x] Plan 29.1: Wave 1 - Remove Category Column from Download Template Generator
- [x] Plan 29.2: Wave 2 - Adapt Excel Import Parser, Summary Modal & Insertion Payload
- [x] Plan 29.3: Wave 3 - Build Verification, Unit Testing & Static Check

**Verification**:
- Klik tombol "Unduh Template": file Excel yang diunduh hanya memiliki 7 kolom tanpa kolom kategori.
- Unggah file template hasil pengisian tanpa kolom kategori: seluruh baris produk berhasil masuk ke tabel produk dengan `category_id = null` dan stok tercatat akurat.
- Toast notifikasi memberitahukan: "Berhasil mengimpor X produk baru. Kategori produk dapat diatur kemudian melalui menu edit produk."
- Seluruh unit tests Vitest dan build produksi Vite (`npm run build`) sukses tanpa error (exit code 0).

---

### Phase 30: Edit Faktur Pembelian dengan Audit Log & Rekonsiliasi Stok
**Status**: ✅ Complete
**Objective**: Mengimplementasikan fitur Edit Faktur Pembelian pada halaman `/admin/pembelian` untuk mengoreksi nomor faktur, tanggal, kuantitas, dan harga beli barang, dengan validasi wajib mengisi alasan perubahan (min. 10 karakter), pencatatan jejak audit (waktu, user, data sebelum & sesudah) ke `audit_logs`, serta rekonsiliasi delta stok master produk secara aman dan atomik.
**Depends on**: Phase 5, Phase 15

**Plans**:
- [x] Plan 30.1: Wave 1 - Database Migration & Atomic Stock Adjustment RPC
- [x] Plan 30.2: Wave 2 - Implement Purchase Service Layer & Audit Methods
- [x] Plan 30.3: Wave 3 - Build Edit Invoice Modal & Audit History Viewer in ManajemenPembelian.tsx
- [x] Plan 30.4: Wave 4 - Build Verification, Unit Testing & Static Check

**Verification**:
- Tombol Edit Faktur hanya muncul/aktif untuk pengguna ber-role admin di tabel riwayat faktur.
- Modal Edit memvalidasi alasan perubahan (wajib minimal 10 karakter) sebelum memperbolehkan simpan koreksi.
- Kuantitas dan harga beli item yang diubah berhasil memperbarui total nilai faktur dan menyesuaikan stok master produk secara atomik (dengan proteksi gagal simpan jika stok akhir menjadi minus).
- Modal Detail Faktur menampilkan riwayat catatan perubahan (waktu, nama pengubah, dan alasan koreksi).
- Seluruh unit tests Vitest dan build produksi Vite (`npm run build`) sukses tanpa error (exit code 0).

---

### Phase 31: Searchable Autocomplete Combobox Produk pada Modal Tambah Barang Masuk
**Status**: ✅ Complete
**Objective**: Mengganti elemen dropdown `<select>` produk statis pada modal "Tambah Barang Masuk" di alur Input Faktur Pembelian (`src/pages/admin/ManajemenPembelian.tsx`) dengan komponen reusable `ProductSearchAutocomplete.tsx`. Komponen ini mendukung pencarian instan berbasis nama dan SKU/Barcode, navigasi keyboard lengkap (ArrowUp, ArrowDown, Enter, Escape), floating dropdown, auto-fill harga beli master produk, serta auto-focus langsung ke field kuantitas/harga berikutnya.
**Depends on**: Phase 5, Phase 30

**Plans**:
- [x] Plan 31.1: Wave 1 - Build Keyboard-Accessible Product Autocomplete Component
- [x] Plan 31.2: Wave 2 - Integrate Autocomplete into Modal Tambah Barang Masuk in ManajemenPembelian.tsx
- [x] Plan 31.3: Wave 3 - Build Verification, Unit Testing & Static Check

**Verification**:
- Komponen `ProductSearchAutocomplete` merender input pencarian dengan icon Search, badge SKU, dan floating list responsif.
- Navigasi keyboard (ArrowDown, ArrowUp, Enter, Escape) bekerja mulus saat memilih item tanpa perlu mouse.
- Memilih produk otomatis mengisi `selectedProductId`, mengisi default `buy_price`, dan memfokuskan field Qty.
- Unit test dan production build Vite (`npm run build`) sukses tanpa error typechecking (exit code 0).

---

### Phase 32: Implementasi Modul Retur Pembelian ke Supplier dengan Otomatisasi Restock Klaim Selesai
**Status**: ✅ Complete
**Objective**: Membangun modul Manajemen Retur Pembelian ke Supplier di `/admin/retur-pembelian` (tabel riwayat faktur retur, detail faktur, modal edit, export Excel/PDF, dan formulir input dengan ProductSearchAutocomplete). Khusus untuk retur bertipe 'PIUTANG_PENGGANTIAN', menyediakan aksi atomik "Tandai Selesai / Terima Barang Pengganti" yang memperbarui status klaim menjadi 'SELESAI_DIGANTI' dan merestock kuantitas barang ke inventori tabel `products`.
**Depends on**: Phase 5, Phase 30, Phase 31

**Plans**:
- [x] Plan 32.1: Wave 1 - Skema Database Retur Pembelian & Atomic Restock Claim RPC
- [x] Plan 32.2: Wave 2 - Service Layer Retur Pembelian & Logika Mutasi Klaim
- [x] Plan 32.3: Wave 3 - UI Halaman Manajemen Retur & Formulir Input Retur Pembelian
- [x] Plan 32.4: Wave 4 - Static Verification, Unit Testing & Production Build

**Verification**:
- Tabel `purchase_returns`, `purchase_return_items`, dan RPC `complete_return_claim` terdefinisi di Supabase migration.
- `purchaseReturnService.ts` mengelola query daftar retur, pembuatan retur dengan validasi stok, update retur, penyelesaian klaim, dan fallback mock yang andal.
- Halaman `/admin/retur-pembelian` dan `/admin/retur-pembelian/input` terdaftar di router `App.tsx` dan link menu di `Sidebar.tsx`.
- Tombol "Terima Pengganti" hanya tampil untuk status 'MENUNGGU_PENGGANTIAN' dan tipe 'PIUTANG_PENGGANTIAN', serta saat diklik otomatis menambah stok kembali dan mencatat audit log.
- Seluruh unit tests Vitest dan build produksi Vite (`npm run build`) sukses tanpa error (exit code 0).

---

### Phase 33: Pindahkan Kelompok Menu Toko Retail & Inventori ke Atas Simpan Pinjam
**Status**: ✅ Complete
**Objective**: Memindahkan posisi seluruh grup navigasi "TOKO RETAIL & INVENTORI" beserta 7 submenunya (Kasir POS, Inventori Produk, Kategori Produk, Manajemen Pembelian, Retur Pembelian, Pengaturan Kasir, Laporan Retail & Stok) ke atas kelompok "SIMPAN PINJAM (KSP / USP)", tepat di bawah item/grup "Dashboard Operasional" pada sidebar navigasi admin (`src/components/layout/Sidebar.tsx` / `AdminSidebar.tsx`).
**Depends on**: Phase 32

**Plans**:
- [x] Plan 33.1: Wave 1 - Move TOKO RETAIL & INVENTORI Menu Group to Top Position in Sidebar
- [x] Plan 33.2: Wave 2 - Static Verification, Unit Testing & Vite Build

**Verification**:
- Array `navigationGroups` pada `src/components/layout/Sidebar.tsx` menempatkan "TOKO RETAIL & INVENTORI" tepat di bawah "OPERASIONAL" dan sebelum "SIMPAN PINJAM (KSP / USP)".
- Seluruh 7 submenu toko retail & inventori tetap utuh dengan rute, ikon Lucide, dan filter hak akses role yang sesuai.
- Re-export `AdminSidebar.tsx` dan `src/components/Sidebar.tsx` tetap valid.
- `npx vitest run` lulus 100% dan build produksi Vite (`npm run build`) exit code 0.

---

### Phase 34: Implementasi Laporan Mutasi Barang Gudang Sesuai Skema Database SIMKOP
**Status:** ✅ Complete
**Objective:** Membangun modul Laporan Mutasi Barang Gudang (Kartu Stok / Stock Ledger) di `/admin/laporan-mutasi` (di bawah kelompok TOKO RETAIL & INVENTORI) untuk melacak seluruh pergerakan barang keluar-masuk secara kronologis (Penjualan POS, Restock Pembelian, Pengeluaran Retur, dan Penerimaan Klaim Pengganti) menggunakan view database PostgreSQL terpadu, kalkulasi running balance, filter interaktif, serta ekspor Excel dan PDF Landscape.
**Depends on:** Phase 32, Phase 33

**Plans:**
- [x] Plan 34.1: Wave 1 - Skema Database PostgreSQL Unified Inventory Mutation View
- [x] Plan 34.2: Wave 2 - Service Layer & Perhitungan Saldo Berjalan (Running Balance)
- [x] Plan 34.3: Wave 3 - UI Laporan Mutasi Barang Gudang & Integrasi Navigasi Sidebar
- [x] Plan 34.4: Wave 4 - Utility Ekspor Excel & PDF Landscape Kartu Stok
- [x] Plan 34.5: Wave 5 - Verifikasi Tipe, Pengujian Otomatis & Vite Production Build

**Deliverables:**
- File migrasi `027_create_inventory_mutation_view.sql` dengan view `v_inventory_mutations`
- Service `inventoryMutationService.ts` dengan query mutasi dan kalkulasi saldo berjalan
- Halaman `LaporanMutasiBarang.tsx` dengan KPI cards, filter controls, dan tabel kartu stok
- Routing `/admin/laporan-mutasi` di `App.tsx` & menu navigasi di `Sidebar.tsx`
- Utility `mutationExporter.ts` untuk ekspor Excel (`exceljs`) dan PDF Landscape (`jspdf` + `jspdf-autotable`)
- Rangkaian unit test (`inventoryMutationService.test.ts`, `mutationExporter.test.ts`, `Sidebar.test.tsx`)

---

### Phase 35: Penyelarasan Tombol Export Excel & Cetak PDF Laporan Mutasi Barang
**Status:** ⏳ In Progress
**Objective:** Menyelaraskan seluruh tombol aksi header pada halaman Laporan Mutasi Barang Gudang (`src/pages/admin/LaporanMutasiBarang.tsx`) ke dalam satu baris horizontal (`flex-row`), dengan ukuran tinggi, padding, ikon, dan gap yang simetris dan konsisten sehingga tombol "Cetak PDF" tidak terlipat atau bertingkat ke baris bawah pada layar desktop/laptop.
**Depends on:** Phase 34

**Plans:**
- [ ] Plan 35.1: Wave 1 - Refactor Header Action Buttons into Symmetric Flex Row
- [ ] Plan 35.2: Wave 2 - Static Verification & Build Integrity

**Deliverables:**
- Tata letak tombol aksi header (Refresh, Export Excel, Cetak PDF) pada `LaporanMutasiBarang.tsx` tersusun horizontal, sejajar, dan simetris (`h-10`, `rounded-lg`).
- Verifikasi kompilasi TypeScript dan Vitest / Vite build lolos tanpa error (exit code 0).

---

## Wave Execution Plan

| Wave | Phases | Rationale |
|------|--------|-----------|
| 1 | Phase 1 | Foundation — harus selesai sebelum semua |
| 2 | Phase 2 | Auth diperlukan oleh semua modul fungsional |
| 3 | Phase 3 + Phase 4 | POS dan Pinjaman independen, dapat paralel |
| 4 | Phase 5 | Inventori bergantung pada katalog produk dari POS; Dashboard butuh semua data |
| 5 | Phase 6 | CRUD Anggota dapat ditambahkan setelah manajemen user |
| 6 | Phase 13 | Refactoring Kasir, dapat berjalan mandiri |
| 7 | Phase 14 | Export/Import Kategori Produk |
| 8 | Phase 15 | Export/Import Katalog Produk |
| 9 | Phase 16 | Dashboard Laporan Keuangan Terpadu (Arus Kas + Estimasi SHU) |
| 10 | Phase 17 | Dashboard Laporan Retail & Inventori POS |
| 11 | Phase 19 | POS Receipt PDF Generator Engine & Modal Integration |
| 12 | Phase 20 | Koperasi Profile Management & Dynamic Receipt Header Configuration |
| 13 | Phase 21 | Resolusi Error Schema Cache koperasi_profile & Migrasi Tabel Profil Koperasi |
| 14 | Phase 22 | Tahan Transaksi POS (F8), Auto-Expire Restock & Pengaturan Kasir |
| 15 | Phase 23 | Relokasi Menu Laporan Retail & Stok ke Kelompok Toko Retail & Inventori |
| 16 | Phase 24 | Shift Buka & Tutup Kasir dengan Rekonsiliasi Kas Kecil POS |
| 17 | Phase 25 | Batasi Metode Pembayaran Khusus Tunai untuk Non-Anggota di POS Kasir |
| 18 | Phase 26 | Konfigurasi Dinamis Persentase Diskon Anggota di Pengaturan Kasir POS |
| 19 | Phase 27 | Perbaiki Fitur Cetak PDF Laporan Retail & Inventori Toko |
| 20 | Phase 28 | Identitas Anggota Aktif pada Modal Pembayaran Kasir (F9) |
| 21 | Phase 29 | Refactor Template & Parser Import Produk Tanpa Kolom Kategori |
| 22 | Phase 30 | Edit Faktur Pembelian dengan Audit Log & Rekonsiliasi Stok |
| 23 | Phase 31 | Searchable Autocomplete Combobox Produk pada Modal Tambah Barang Masuk |
| 24 | Phase 32 | Implementasi Modul Retur Pembelian ke Supplier dengan Otomatisasi Restock Klaim Selesai |
| 25 | Phase 33 | Pindahkan Kelompok Menu Toko Retail & Inventori ke Atas Simpan Pinjam |
| 26 | Phase 34 | Implementasi Laporan Mutasi Barang Gudang Sesuai Skema Database SIMKOP |
| 27 | Phase 35 | Penyelarasan Tombol Export Excel & Cetak PDF Laporan Mutasi Barang |

---

## Progress Summary

| Phase | Name | Status | Plans | Complete |
|-------|------|--------|-------|----------|
| 1 | Foundation & Design System | ✅ | 3/3 | 100% |
| 2 | Autentikasi & User Management | ✅ | 4/4 | 100% |
| 3 | Kasir (POS) & Parked Notes | ✅ | 5/5 | 100% |
| 4 | Pinjaman (0% Bunga) & Simpanan | ✅ | 5/5 | 100% |
| 5 | Inventori, Restock & Dashboard | ✅ | 5/5 | 100% |
| 6 | Manajemen Anggota Koperasi | ✅ | 3/3 | 100% |
| 7 | Backup Database | ✅ | 2/2 | 100% |
| 8 | Konfigurasi & Fleksibilitas Simpan Pinjam Dinamis | ✅ | 5/5 | 100% |
| 9 | Modul Pinjaman Komprehensif (THP & FIFO) | ✅ | 7/7 | 100% |
| 10 | Export Template and Salary-Account Reconciliation Import | ✅ | 4/4 | 100% |
| 11 | Buku Pembantu & Kliring Penyelesaian Hak-Kewajiban Anggota Keluar | ✅ | 3/3 | 100% |
| 12 | Member Resignation Settlement Actions | ✅ | 3/3 | 100% |
| 13 | Refactoring Modul Kasir (POS) SIMKOP Enterprise | ✅ | 5/5 | 100% |
| 14 | Product Categories Excel Template Export and Batch Import | ✅ | 2/2 | 100% |
| 15 | Product Catalog Excel Template Export and Batch Import | ✅ | 2/2 | 100% |
| 16 | Dashboard Laporan Keuangan Terpadu | ✅ | 3/3 | 100% |
| 17 | Dashboard Laporan Retail & Inventori POS | ✅ | 3/3 | 100% |
| 18 | Refactor Native Browser Dialogs | ✅ | 3/3 | 100% |
| 19 | Download PDF Struk Transaksi POS | ✅ | 1/1 | 100% |
| 20 | Manajemen Profil Koperasi & Header Struk POS | ✅ | 1/1 | 100% |
| 21 | Resolusi Error Schema Cache koperasi_profile & Migrasi Tabel Profil Koperasi | ✅ | 1/1 | 100% |
| 22 | Tahan Transaksi POS (F8), Auto-Expire Restock & Pengaturan Kasir | ✅ | 4/4 | 100% |
| 23 | Relokasi Menu Laporan Retail & Stok ke Kelompok Toko Retail & Inventori | ✅ | 2/2 | 100% |
| 24 | Shift Buka & Tutup Kasir dengan Rekonsiliasi Kas Kecil POS | ✅ | 3/3 | 100% |
| 25 | Batasi Pembayaran Non-Anggota di POS Kasir | ✅ | 3/3 | 100% |
| 26 | Konfigurasi Dinamis Persentase Diskon Anggota di POS | ✅ | 5/5 | 100% |
| 27 | Perbaiki Fitur Cetak PDF Laporan Retail & Inventori Toko | ✅ | 3/3 | 100% |
| 28 | Identitas Anggota Aktif pada Modal Pembayaran Kasir (F9) | ✅ | 2/2 | 100% |
| 29 | Refactor Template & Import Produk Tanpa Kategori | ✅ | 3/3 | 100% |
| 30 | Edit Faktur Pembelian, Audit Log & Stok | ✅ | 4/4 | 100% |
| 31 | Searchable Autocomplete Combobox Produk pada Modal Tambah Barang Masuk | ✅ | 3/3 | 100% |
| 32 | Retur Pembelian ke Supplier & Restock Klaim | ✅ | 4/4 | 100% |
| 33 | Pindahkan Kelompok Menu Toko Retail & Inventori ke Atas Simpan Pinjam | ✅ | 2/2 | 100% |
| 34 | Laporan Mutasi Barang Gudang | ✅ | 5/5 | 100% |
| 35 | Penyelarasan Tombol Header Laporan Mutasi | ⏳ | 0/2 | 0% |

---

## Timeline

| Phase | Started | Completed | Duration |
|-------|---------|-----------|----------|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | 2026-09-27 | — |
| 7 | 2026-09-27 | 2026-09-27 | 1 day |
| 8 | 2026-09-27 | 2026-09-27 | 1 day |
| 9 | — | — | — |
| 10 | 2026-09-27 | 2026-09-27 | 1 day |
| 11 | 2026-09-28 | 2026-09-28 | 1 day |
| 12 | 2026-09-28 | 2026-09-28 | 1 day |
| 13 | 2026-09-28 | 2026-09-28 | 1 day |
| 14 | 2026-09-28 | 2026-09-28 | 1 day |
| 15 | 2026-09-28 | 2026-09-30 | — |
| 16 | 2026-09-30 | 2026-09-30 | 1 day |
| 17 | 2026-09-30 | 2026-09-30 | 1 day |
| 18 | 2026-10-28 | 2026-10-28 | 1 day |
| 19 | 2026-10-28 | 2026-10-28 | 1 day |
| 20 | 2026-10-28 | 2026-10-28 | 1 day |
| 21 | 2026-10-28 | 2026-10-28 | 1 day |
| 22 | 2026-10-28 | 2026-10-28 | 1 day |
| 23 | 2026-10-28 | 2026-10-28 | 1 day |
| 24 | 2026-10-28 | 2026-10-28 | 1 day |
| 25 | 2026-10-29 | 2026-10-29 | 1 day |
| 26 | 2026-10-29 | 2026-10-29 | 1 day |
| 27 | 2026-10-29 | 2026-10-29 | 1 day |
| 28 | 2026-10-30 | 2026-10-30 | 1 day |
| 29 | 2026-10-30 | 2026-10-30 | 1 day |
| 30 | 2026-10-30 | 2026-10-30 | 1 day |
| 31 | 2026-10-30 | 2026-10-30 | 1 day |
| 32 | 2026-10-30 | 2026-10-30 | 1 day |
| 33 | 2026-10-30 | 2026-10-30 | 1 day |
| 34 | 2026-10-30 | 2026-10-30 | 1 day |
| 35 | 2026-10-30 | — | — |


