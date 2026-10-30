---
phase: 29
plan: 3
wave: 3
gap_closure: false
---

# Plan 29.3: Wave 3 - Build Verification, Unit Testing & Static Check

## Objective
Memverifikasi integrasi kode secara menyeluruh dengan menambahkan unit test untuk `productExcelService.ts` (memvalidasi struktur template 7 kolom dan parsing data tanpa kolom kategori), menjalankan seluruh test suite Vitest, serta memvalidasi build produksi Vite (`npm run build`).

## Context
Load these files for context:
- src/services/productExcelService.ts
- src/components/products/ProductImportModal.tsx
- src/pages/admin/ManajemenProduk.tsx
- package.json

## Tasks

<task type="auto">
  <name>Build Verification and Unit Testing</name>
  <files>
    src/services/productExcelService.test.ts
    src/services/productExcelService.ts
  </files>
  <action>
    1. Buat berkas unit test `src/services/productExcelService.test.ts`:
       - Uji fungsi pembentukan template Excel (`exportProductTemplate`):
         * Pastikan template Excel yang digenerate memiliki tepat 7 kolom (`sku, nama_produk, satuan, harga_beli, harga_jual, stok_awal, min_stok_alert`).
         * Pastikan kolom `kategori` tidak ada di header sheet template.
       - Uji fungsi parser (`parseProductUpload`):
         * Pastikan file Excel yang berisi 7 kolom baku tanpa kolom kategori berhasil diparsing tanpa error.
         * Pastikan baris data menghasilkan objek produk dengan `categoryName: null` dan nilai stok/harga terpetakan secara numerik.
         * Pastikan jika kolom wajib hilang (misalnya `sku` atau `harga_jual`), parser melempar error validasi yang sesuai.
    2. Jalankan test suite Vitest:
       `npx vitest run src/services/productExcelService.test.ts` dan pastikan seluruh pengujian lulus 100%.
    3. Jalankan seluruh unit test proyek:
       `npx vitest run` untuk memastikan tidak ada efek samping / regresi ke modul lain.
    4. Jalankan validasi tipe TypeScript dan build bundler produksi:
       `npm run build`.
  </action>
  <verify>
    - Unit tests `productExcelService.test.ts` lulus 100%.
    - Seluruh unit tests dalam proyek SIMKOP lulus.
    - `npm run build` sukses dengan exit code 0 tanpa error tipe TypeScript atau kegagalan bundler Vite.
  </verify>
  <done>
    Fitur template dan import produk siap digunakan dan terverifikasi secara statis maupun dinamis.
  </done>
</task>

## Success Criteria
- [ ] Unit tests untuk template 7 kolom dan parsing produk tanpa kolom kategori lulus 100%.
- [ ] Semua unit test pada proyek berjalan sukses tanpa regresi.
- [ ] `npm run build` berhasil dengan exit code 0 tanpa error kompilasi TypeScript atau Vite.

