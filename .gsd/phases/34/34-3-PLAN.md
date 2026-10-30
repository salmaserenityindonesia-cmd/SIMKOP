---
phase: 34
plan: 3
wave: 3
gap_closure: false
---

# Plan 34.3: Wave 3 - UI Laporan Mutasi Barang Gudang & Integrasi Navigasi Sidebar

## Objective
Membangun antarmuka pengguna halaman Laporan Mutasi Barang Gudang pada `src/pages/admin/LaporanMutasiBarang.tsx`. Halaman ini menyediakan visualisasi kartu metrik ringkasan KPI (Masuk, Keluar, Net Selisih, Total Mutasi), bilah kontrol filter responsif (rentang tanggal, tipe mutasi, combobox produk kartu stok, dan pencarian teks), tabel mutasi stok interaktif dengan status badges berwarna dan kolom saldo berjalan, tombol ekspor cepat ke Excel dan PDF, serta integrasi routing di `src/App.tsx` dan submenu sidebar di `src/components/layout/Sidebar.tsx`.

## Context
Load these files for context:
- src/pages/admin/laporan-retail/index.tsx
- src/pages/admin/PembelianBarang.tsx
- src/pages/admin/ReturPembelian.tsx
- src/components/layout/Sidebar.tsx
- src/components/layout/Sidebar.test.tsx
- src/App.tsx

## Tasks

<task type="auto">
  <name>Build LaporanMutasiBarang Page Component</name>
  <files>
    src/pages/admin/LaporanMutasiBarang.tsx
  </files>
  <action>
    Buat `src/pages/admin/LaporanMutasiBarang.tsx`:
    1. Header Bar:
       - Judul: "Laporan Mutasi Barang Gudang"
       - Deskripsi: "Audit arus pergerakan stok keluar-masuk (penjualan kasir, pembelian supplier, retur barang, klaim pengganti) dengan kalkulasi saldo berjalan."
       - Action buttons: Tombol "Export Excel" (ikon FileSpreadsheet, warna emerald) dan tombol "Cetak PDF" (ikon FileText/Printer, warna biru/indigo).
    2. KPI Summary Cards (4 Metrik Utama):
       - Card 1: Total Barang Masuk (+) (Ikon ArrowDownRight / PackagePlus, badge hijau/emerald, menampilkan total pcs dan nilai rupiah)
       - Card 2: Total Barang Keluar (-) (Ikon ArrowUpRight / PackageMinus, badge merah/rose, menampilkan total pcs dan nilai rupiah)
       - Card 3: Selisih Net Mutasi (+ / -) (Ikon Activity / Scale, badge biru/cyan jika positif, amber jika negatif)
       - Card 4: Total Mutasi Transaksi (Ikon History / Layers, badge ungu/purple)
    3. Filter Controls Bar:
       - Periode: Input tanggal 'Dari Tanggal' dan 'Sampai Tanggal' (default: 30 hari ke belakang s/d hari ini) disertai tombol preset (Hari Ini, 7 Hari Terakhir, 30 Hari Terakhir, Bulan Ini).
       - Filter Jenis Mutasi: Dropdown selector (Semua Jenis, Penjualan Kasir POS, Restock Pembelian, Retur Supplier, Klaim Pengganti).
       - Filter Produk Spesifik (Mode Kartu Stok): Combobox/select produk untuk melihat kartu stok barang tertentu secara mendalam. Jika produk dipilih, tampilkan info saldo awal dan saldo akhir produk.
       - Pencarian Teks: Input cari nomor nota/faktur/keterangan dengan debounce.
    4. Tabel Data Mutasi Stok:
       - Kolom tabel:
         * No
         * Waktu & Tanggal (dd/MM/yyyy HH:mm)
         * No. Referensi (Link atau teks tebal)
         * SKU & Nama Barang
         * Jenis Mutasi (Badge: Hijau untuk Pembelian, Merah untuk Penjualan POS, Orange untuk Retur, Biru untuk Klaim)
         * Masuk (+)
         * Keluar (-)
         * Saldo Berjalan (hanya aktif jika filter produk dipilih atau dihitung per baris)
         * Harga Satuan (Rp)
         * Catatan / Keterangan
       - State kosong (Empty State): Tampilan ilustrasi dan pesan jelas jika tidak ada transaksi mutasi dalam rentang filter yang dipilih.
       - Pagination / scrollable responsive table untuk dataset panjang.
  </action>
  <verify>
    npm run typecheck
  </verify>
  <done>
    Halaman LaporanMutasiBarang.tsx terimplementasi dengan antarmuka modern yang responsif, visual badge jelas, dan integrasi data lengkap.
  </done>
</task>

<task type="auto">
  <name>Register Route and Update Sidebar Navigation</name>
  <files>
    src/App.tsx,
    src/components/layout/Sidebar.tsx,
    src/components/layout/Sidebar.test.tsx
  </files>
  <action>
    1. Pada `src/App.tsx`:
       - Import `LaporanMutasiBarang` dari `./pages/admin/LaporanMutasiBarang`.
       - Daftarkan route baru di bawah `<ProtectedRoute>`:
         ```tsx
         <Route 
           path="/admin/laporan-mutasi" 
           element={
             <ProtectedRoute>
               <LaporanMutasiBarang />
             </ProtectedRoute>
           } 
         />
         ```
    2. Pada `src/components/layout/Sidebar.tsx`:
       - Tambahkan icon `ArrowLeftRight` dari `lucide-react`.
       - Tambahkan menu item ke kelompok `TOKO RETAIL & INVENTORI` tepat setelah `Laporan Retail & Stok`:
         ```ts
         { label: 'Laporan Mutasi Barang', icon: ArrowLeftRight, href: '/admin/laporan-mutasi' },
         ```
    3. Pada `src/components/layout/Sidebar.test.tsx`:
       - Perbarui ekspektasi array submenu `TOKO RETAIL & INVENTORI` agar mencakup `'Laporan Mutasi Barang'` dan `'/admin/laporan-mutasi'`.
  </action>
  <verify>
    npx vitest run src/components/layout/Sidebar.test.tsx
  </verify>
  <done>
    Route /admin/laporan-mutasi terdaftar dan menu sidebar terintegrasi dengan tes navigasi yang lulus.
  </done>
</task>

## Success Criteria
- [ ] Halaman `LaporanMutasiBarang.tsx` memuat header, 4 KPI cards, filter controls, dan tabel kartu stok
- [ ] Rute `/admin/laporan-mutasi` terdaftar di `App.tsx`
- [ ] Submenu "Laporan Mutasi Barang" muncul di bawah kelompok "TOKO RETAIL & INVENTORI" di Sidebar
- [ ] Tes unit `Sidebar.test.tsx` lulus 100%
