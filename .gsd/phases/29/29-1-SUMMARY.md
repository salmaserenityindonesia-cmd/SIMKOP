# Summary: Plan 29.1 (Wave 1)

## Objective
Menghapus kolom `kategori` dari generator template berkas Excel produk (`template_katalog_produk.xlsx`) pada `src/services/productExcelService.ts`, sehingga template hanya memiliki 7 kolom utama (`sku, nama_produk, satuan, harga_beli, harga_jual, stok_awal, min_stok_alert`) beserta data contoh (dummy sample data) yang selaras tanpa kolom kategori.

## Tasks Executed

### Task 1: Remove Category Column from Download Template
- **Files Modified**:
  - `src/services/productExcelService.ts`
- **Changes**:
  1. Menghapus konfigurasi `{ header: 'kategori', key: 'kategori', width: 25 }` dari `sheet.columns` pada fungsi `exportProductTemplate`.
  2. Menstandarkan 7 kolom header: `sku`, `nama_produk`, `satuan`, `harga_beli`, `harga_jual`, `stok_awal`, `min_stok_alert`.
  3. Menghapus atribut `kategori: 'Herbal'` dari 2 baris contoh data dummy.
  4. Mempertahankan pemformatan text string untuk SKU (`sheet.getColumn('sku').numFmt = '@'`) serta format bold & latar abu-abu header.
- **Commit**: `3a298301` (`feat(phase-29): remove category column from download template`)

## Verification Evidence
1. **TypeScript Type Check**:
   - Command: `npx tsc --noEmit`
   - Result: Exit code 0 (bersih tanpa error).
2. **Code Inspection**:
   - Berkas `src/services/productExcelService.ts` pada baris 12-20 mendefinisikan tepat 7 kolom tanpa `kategori`.
   - Data contoh (baris 23-40) bersih dari properti `kategori`.

## Deviations / Deferred
- None.
