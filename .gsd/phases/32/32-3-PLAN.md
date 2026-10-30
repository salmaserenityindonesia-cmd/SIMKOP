---
phase: 32
plan: 3
wave: 3
gap_closure: false
---

# Plan 32.3: Wave 3 - UI Halaman Manajemen Retur & Formulir Input Retur Pembelian

## Objective
Membangun antarmuka pengguna modul Retur Pembelian ke Supplier yang konsisten dengan desain sistem SIMKOP. Meliputi halaman tabel riwayat retur pembelian (`src/pages/admin/ManajemenReturPembelian.tsx`) dengan modal detail, modal koreksi, ekspor Excel/PDF, serta modal konfirmasi khusus "Terima Barang Pengganti" (restock otomatis), halaman input faktur retur baru (`src/pages/admin/InputReturPembelian.tsx`) dengan `ProductSearchAutocomplete`, serta integrasi navigasi menu dan routing di `src/App.tsx` dan `src/components/layout/Sidebar.tsx`.

## Context
Load these files for context:
- src/pages/admin/ManajemenPembelian.tsx
- src/components/common/ProductSearchAutocomplete.tsx
- src/components/layout/Sidebar.tsx
- src/App.tsx
- src/services/purchaseReturnService.ts

## Tasks

<task type="auto">
  <name>Build ManajemenReturPembelian & InputReturPembelian Pages</name>
  <files>
    src/pages/admin/ManajemenReturPembelian.tsx
    src/pages/admin/InputReturPembelian.tsx
  </files>
  <action>
    1. Buat `src/pages/admin/ManajemenReturPembelian.tsx`:
       - Gunakan `AdminLayout` dan `useFeedback` untuk notifikasi toast.
       - Kartu ringkasan metrik di bagian atas:
         * Total Faktur Retur
         * Total Nilai Retur (Rp)
         * Klaim Menunggu Penggantian (badge amber/kuning)
         * Klaim Selesai Diganti (badge emerald/hijau)
       - Search & Filter bar: cari berdasarkan nomor retur, nama supplier, atau nomor faktur asal, serta filter status klaim.
       - Tabel Riwayat Faktur Retur:
         * Kolom: Tanggal, No. Retur, Supplier, No. Faktur Asal, Jenis Retur (Barang Rusak / Piutang Penggantian), Status Klaim, Total Nilai Retur, dan Kolom Aksi.
         * Badge Status Klaim:
           - `'MENUNGGU_PENGGANTIAN'`: warna Amber / Oranye (`bg-amber-500/10 text-amber-700 border-amber-300`).
           - `'SELESAI_DIGANTI'`: warna Emerald / Hijau (`bg-emerald-500/10 text-emerald-700 border-emerald-300`).
           - `'HAPUS_BUKU'`: warna Slate / Abu-abu.
         * Kolom Aksi:
           - Tombol "Lihat Detail" (icon Eye): Buka modal detail faktur retur, rincian produk, alasan retur, dan log penyelesaian.
           - Tombol "Edit" (icon Edit3): Buka modal koreksi nomor retur / catatan (dinonaktifkan jika sudah selesai diganti).
           - **Tombol "Terima Pengganti" (icon PackageCheck / CheckCircle)**:
             * HANYA tampil jika `return_type === 'PIUTANG_PENGGANTIAN'` dan `claim_status === 'MENUNGGU_PENGGANTIAN'`.
             * Klik tombol membuka Modal Konfirmasi Penerimaan Pengganti:
               - Menampilkan ringkasan produk dan jumlah unit yang akan dikembalikan ke stok gudang.
               - Keterangan: "Barang pengganti fisik dari supplier telah diterima? Stok produk akan otomatis ditambahkan kembali ke inventori."
               - Input catatan opsional (misal nama penerima / keterangan kondisi barang).
               - Tombol aksi: "Konfirmasi Penerimaan & Tambah Stok" yang memanggil `purchaseReturnService.completeReturnClaim()`.
               - Setelah sukses: munculkan toast pemberitahuan sukses dan segarkan data tabel.
       - Ekspor data tabel ke format Excel dan PDF menggunakan utility `exportToExcel` dan `exportToPDF`.
       - Tombol navigasi "Buat Retur Baru" mengarahkan ke `/admin/retur-pembelian/input`.

    2. Buat `src/pages/admin/InputReturPembelian.tsx`:
       - Header formulir:
         * Nomor Retur (otomatis di-generate dengan `purchaseReturnService.generateReturnNumber()`).
         * Tanggal Retur (default tanggal hari ini).
         * Supplier (pilihan dropdown dari `getSuppliers()` atau input teks supplier).
         * Nomor Faktur Pembelian Asal (teks referensi faktur sebelumnya).
         * Jenis Retur: pilihan antara `'PIUTANG_PENGGANTIAN'` (klaim tukar barang baru) atau `'BARANG_RUSAK'` (musnahkan/hapus buku).
         * Catatan Umum Retur.
       - Tabel Keranjang Item Retur:
         * Menggunakan `ProductSearchAutocomplete` pada modal penambahan item untuk mencari berdasarkan SKU, barcode, atau nama produk.
         * Menampilkan sisa stok gudang saat ini.
         * Validasi input Qty: tidak boleh bernilai <= 0 dan tidak boleh melebihi sisa stok produk yang ada di gudang.
         * Input harga beli satuan (auto-fill dari master produk) dan subtotal otomatis.
         * Input alasan spesifik per barang (misal: "kemasan bocor", "kadaluarsa").
       - Tombol Simpan Retur Pembelian:
         * Memanggil `purchaseReturnService.createPurchaseReturn()`.
         * Menampilkan toast feedback sukses.
         * Mengarahkan pengguna kembali ke `/admin/retur-pembelian`.
  </action>
  <verify>
    npm run typecheck
  </verify>
  <done>
    Halaman ManajemenReturPembelian dan InputReturPembelian berhasil dibuat lengkap dengan modal terima barang pengganti, autocomplete pencarian barang, dan proteksi validasi stok.
  </done>
</task>

<task type="auto">
  <name>Register Routes in App.tsx and Sidebar Navigation</name>
  <files>
    src/App.tsx
    src/components/layout/Sidebar.tsx
    src/components/layout/AdminSidebar.tsx
  </files>
  <action>
    1. Daftarkan rute di `src/App.tsx`:
       - Import `ManajemenReturPembelian` dan `InputReturPembelian`.
       - Tambahkan route:
         ```tsx
         <Route 
           path="/admin/retur-pembelian" 
           element={
             <ProtectedRoute>
               <ManajemenReturPembelian />
             </ProtectedRoute>
           } 
         />
         <Route 
           path="/admin/retur-pembelian/input" 
           element={
             <ProtectedRoute>
               <InputReturPembelian />
             </ProtectedRoute>
           } 
         />
         ```
    2. Tambahkan item navigasi di `src/components/layout/Sidebar.tsx`:
       - Import ikon `RotateCcw` dari `lucide-react`.
       - Pada kelompok `"TOKO RETAIL & INVENTORI"`, sisipkan item menu tepat di bawah `"Manajemen Pembelian"`:
         ```tsx
         { label: 'Retur Pembelian', icon: RotateCcw, href: '/admin/retur-pembelian' },
         ```
    3. Buat file `src/components/layout/AdminSidebar.tsx` yang mengekspor `Sidebar` sebagai default untuk mendukung kompatibilitas referensi komponen.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Menu Retur Pembelian muncul di navigasi sidebar dan rute halaman retur terhubung ke aplikasi utama dengan proteksi autentikasi.
  </done>
</task>

## Success Criteria
- [ ] Halaman `ManajemenReturPembelian` menampilkan tabel riwayat, badge status klaim, dan kartu ringkasan.
- [ ] Tombol "Terima Pengganti" hanya muncul untuk retur tipe `PIUTANG_PENGGANTIAN` berstatus `MENUNGGU_PENGGANTIAN`.
- [ ] Modal konfirmasi penerimaan barang pengganti berhasil merestock stok dan mengubah status klaim menjadi `SELESAI_DIGANTI`.
- [ ] Halaman `InputReturPembelian` mengintegrasikan `ProductSearchAutocomplete` dan memvalidasi stok tidak melebihi persediaan.
- [ ] Menu "Retur Pembelian" tampil di Sidebar dalam grup "TOKO RETAIL & INVENTORI" di bawah "Manajemen Pembelian".
- [ ] `npm run build` berhasil tanpa kendala bundling.
