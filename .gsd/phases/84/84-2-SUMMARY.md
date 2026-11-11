# Summary 84.2: Align UI Table and Filter Dropdowns in LaporanPenarikanSimpanan.tsx

## Overview
Berhasil menyelaraskan antarmuka tampilan dan filter dropdown pada halaman `/admin/laporan-penarikan` (`src/pages/admin/LaporanPenarikanSimpanan.tsx`):
1. **Pembaruan Komponen DepositTypeBadge**:
   - Memastikan simpanan berkategori `belanja` menampilkan label resmi `"Simpanan Belanja Bulanan"`.
   - Mengaplikasikan styling badge amber yang kontras (`bg-amber-100 text-amber-800 border-amber-200` dengan bullet `bg-amber-500`) untuk membedakan simpanan belanja secara tegas dari Simpanan Lebaran (emerald), Pokok/Wajib (slate), dan Sukarela (purple).
2. **Penyelarasan Dropdown Filter Jenis Simpanan**:
   - Opsi `belanja` diperbarui menjadi label resmi koperasi: `"Simpanan Belanja Bulanan"`.
   - Penyelarasan label filter ekspor Excel (`handleExportExcel`).
3. **Penyajian Tabel Buku Besar Pengawasan**:
   - Kolom `IDENTITAS ANGGOTA` menampilkan nama anggota secara tegas (`font-bold`) dan NRP beserta pangkat di bawahnya.
   - Kolom `JENIS SIMPANAN` merender badge simpanan yang konsisten dengan data mutasi.
4. **Pengujian Unit**:
   - Memperbarui pengujian `DepositTypeBadge` dan filter options di `LaporanPenarikanSimpanan.test.tsx`.
   - Menambahkan skenario uji render transaksi kasir POS INV-1794286975137 dengan nama "Yanto Santoso", NRP "96316180", dan badge amber "Simpanan Belanja Bulanan" (8/8 tests passing).

