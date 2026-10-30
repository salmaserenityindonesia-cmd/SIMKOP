---
phase: 29
plan: 1
wave: 1
gap_closure: false
---

# Plan 29.1: Wave 1 - Remove Category Column from Download Template Generator

## Objective
Menghapus kolom `kategori` dari generator template berkas Excel produk (`template_katalog_produk.xlsx`) pada `src/services/productExcelService.ts`, sehingga template hanya memiliki 7 kolom utama (`sku, nama_produk, satuan, harga_beli, harga_jual, stok_awal, min_stok_alert`) beserta data contoh (dummy sample data) yang selaras tanpa kolom kategori.

## Context
Load these files for context:
- src/services/productExcelService.ts
- src/pages/admin/ManajemenProduk.tsx

## Tasks

<task type="auto">
  <name>Remove Category Column from Download Template</name>
  <files>
    src/services/productExcelService.ts
  </files>
  <action>
    1. Buka `src/services/productExcelService.ts`.
    2. Pada fungsi `exportProductTemplate`:
       - Hapus kolom `{ header: 'kategori', key: 'kategori', width: 25 }` dari konfigurasi `sheet.columns`.
       - Tetapkan susunan 7 header baku pada sheet template:
         1. `sku` (width: 20)
         2. `nama_produk` (width: 40)
         3. `satuan` (width: 15)
         4. `harga_beli` (width: 20)
         5. `harga_jual` (width: 20)
         6. `stok_awal` (width: 15)
         7. `min_stok_alert` (width: 15)
       - Perbarui baris contoh (dummy sample rows) agar tidak menyertakan atribut `kategori`:
         * Baris 1: `{ sku: '1234567890123', nama_produk: 'Minyak Cengkeh 50ml', satuan: 'botol', harga_beli: 15000, harga_jual: 20000, stok_awal: 50, min_stok_alert: 5 }`
         * Baris 2: `{ sku: '0987654321098', nama_produk: 'Minyak Seree 100ml', satuan: 'botol', harga_beli: 25000, harga_jual: 35000, stok_awal: 20, min_stok_alert: 5 }`
       - Pertahankan pemformatan teks string pada kolom SKU: `sheet.getColumn('sku').numFmt = '@';`.
       - Pertahankan styling header bold dan warna latar abu-abu muda (`FFE0E0E0`).
  </action>
  <verify>
    Periksa berkas `productExcelService.ts`: fungsi `exportProductTemplate` mendefinisikan tepat 7 kolom tanpa header `kategori` dan data sampel bersih dari properti `kategori`.
  </verify>
  <done>
    Template unduhan Excel produk bersih dari field kategori dan memiliki 7 kolom standar.
  </done>
</task>

## Success Criteria
- [ ] Header kolom `kategori` telah dihapus dari `sheet.columns` pada `exportProductTemplate`.
- [ ] Terdapat tepat 7 kolom header: `sku`, `nama_produk`, `satuan`, `harga_beli`, `harga_jual`, `stok_awal`, `min_stok_alert`.
- [ ] Data baris dummy sampel tidak lagi mencantumkan properti `kategori`.

