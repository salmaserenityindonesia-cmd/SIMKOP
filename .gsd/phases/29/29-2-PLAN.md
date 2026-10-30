---
phase: 29
plan: 2
wave: 2
gap_closure: false
---

# Plan 29.2: Wave 2 - Adapt Excel Import Parser, Summary Modal & Insertion Payload

## Objective
Menyesuaikan logika parsing file Excel pada `src/services/productExcelService.ts` untuk memvalidasi 7 kolom wajib (`sku, nama_produk, satuan, harga_beli, harga_jual, stok_awal, min_stok_alert`) tanpa ketergantungan pada kolom `kategori`. Mengatur payload upsert produk ke database Supabase dengan `category_id: null`, menyesuaikan dialog konfirmasi import `ProductImportModal.tsx`, serta menyempurnakan notifikasi feedback toast pada `src/pages/admin/ManajemenProduk.tsx`.

## Context
Load these files for context:
- src/services/productExcelService.ts
- src/components/products/ProductImportModal.tsx
- src/pages/admin/ManajemenProduk.tsx

## Tasks

<task type="auto">
  <name>Adjust Import Parser and Insert Logic</name>
  <files>
    src/services/productExcelService.ts
    src/components/products/ProductImportModal.tsx
    src/pages/admin/ManajemenProduk.tsx
  </files>
  <action>
    1. Perbarui `src/services/productExcelService.ts`:
       - Pada interface `ParsedProduct`, tetapkan `categoryName?: string | null;` opsional/nullable.
       - Pada fungsi `parseProductUpload`:
         * Sesuaikan validasi kolom wajib:
           ```ts
           const reqCols = ['sku', 'nama_produk', 'satuan', 'harga_beli', 'harga_jual', 'stok_awal', 'min_stok_alert'];
           for (const c of reqCols) {
             if (!colIdx[c]) throw new Error(`Kolom wajib '${c}' tidak ditemukan pada template Excel.`);
           }
           ```
         * Hapus ketergantungan membaca kolom `kategori`.
         * Petakan data setiap baris:
           - `sku`: `String(rawSku).trim()`
           - `name`: `String(rawName).trim()`
           - `categoryName`: null
           - `unit`: String(getVal('satuan') || 'pcs').trim()
           - `buy_price`: Math.min(Math.max(0, Number(getVal('harga_beli')) || 0), 100000000)
           - `sell_price`: Math.min(Math.max(0, Number(getVal('harga_jual')) || 0), 100000000)
           - `stock`: Math.min(Math.max(0, parseInt(getVal('stok_awal')) || 0), 100000)
           - `min_stock_alert`: Math.min(Math.max(0, parseInt(getVal('min_stok_alert')) || 5), 100000)
           - `is_active`: true
         * Kembalikan `newCategoriesToCreate: []` pada hasil `ProductParseResult`.
       - Pada fungsi `batchUpsertProducts`:
         * Setiap produk langsung dipetakan ke skema `public.products` dengan `category_id: null`:
           ```ts
           const payload = allProducts.map(p => ({
             sku: p.sku,
             name: p.name,
             category_id: null,
             unit: p.unit || 'pcs',
             buy_price: p.buy_price,
             sell_price: p.sell_price,
             stock: p.stock,
             min_stock_alert: p.min_stock_alert,
             is_active: p.is_active
           }));
           ```
         * Lakukan upsert:
           ```ts
           const { error } = await supabase
             .from('products')
             .upsert(payload, { onConflict: 'sku' });
           if (error) throw new Error(`Gagal menyimpan produk batch: ${error.message}`);
           ```
    2. Perbarui `src/components/products/ProductImportModal.tsx`:
       - Hapus blok peringatan kategori baru yang tidak lagi relevan (`newCategoriesToCreate`).
       - Tambahkan catatan info yang ramah pengguna:
         "Kategori untuk produk impor akan diset default (tanpa kategori) dan dapat dikelompokkan manual melalui menu edit produk."
    3. Perbarui `src/pages/admin/ManajemenProduk.tsx`:
       - Pada fungsi `handleImportConfirm`:
         * Hitung total produk baru yang diimpor (`parseResult.newProducts.length`).
         * Berikan notifikasi toast:
           `showToast(`Berhasil mengimpor ${parseResult.newProducts.length} produk baru. Kategori produk dapat diatur kemudian melalui menu edit produk.`, 'success');`
         * Pastikan `fetchProducts()` dipanggil untuk merefresh tabel katalog produk.
  </action>
  <verify>
    - Unggah berkas Excel yang mengikuti format 7 kolom: parser membaca seluruh produk dengan benar.
    - Modal menampilkan jumlah produk baru dan produk update tanpa blok deteksi kategori.
    - Saat dikonfirmasi, produk tersimpan di database dengan `category_id = null`, daftar produk dimuat ulang, dan notifikasi informatif muncul.
  </verify>
  <done>
    Alur import produk massal bekerja mulus tanpa error kolom kategori dan data produk tersimpan dengan category_id null.
  </done>
</task>

## Success Criteria
- [ ] Validasi kolom file Excel mensyaratkan 7 header baku tanpa mewajibkan kolom `kategori`.
- [ ] Objek payload upsert produk ke Supabase menyetel `category_id: null`.
- [ ] `ProductImportModal.tsx` menampilkan catatan bahwa kategori produk dapat diatur manual nantinya.
- [ ] `ManajemenProduk.tsx` menampilkan toast sukses spesifik dan merefresh katalog produk setelah proses import selesai.

