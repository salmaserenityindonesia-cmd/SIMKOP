---
phase: 31
plan: 2
wave: 2
gap_closure: false
---

# Plan 31.2: Wave 2 - Integrate Autocomplete into Modal Tambah Barang Masuk

## Objective
Mengintegrasikan komponen `ProductSearchAutocomplete` ke dalam modal "Tambah Barang Masuk" pada alur faktur pembelian di `src/pages/admin/ManajemenPembelian.tsx`. Menggantikan `<select>` bawaan HTML, memicu auto-fill harga beli master produk saat produk dipilih, serta otomatis memindahkan fokus kursor ke input kuantitas (Qty) setelah produk terpilih untuk mempercepat alur kerja pengguna secara signifikan.

## Context
Load these files for context:
- src/components/common/ProductSearchAutocomplete.tsx
- src/pages/admin/ManajemenPembelian.tsx
- src/services/koperasiService.ts

## Tasks

<task type="auto">
  <name>Replace Native Select with Autocomplete in Tambah Barang Modal</name>
  <files>
    src/pages/admin/ManajemenPembelian.tsx
  </files>
  <action>
    1. Modifikasi `src/pages/admin/ManajemenPembelian.tsx`:
       - Import `ProductSearchAutocomplete` dari `../../components/common/ProductSearchAutocomplete`.
       - Tambahkan reference `const qtyInputRef = useRef<HTMLInputElement>(null);` untuk auto-fokus input Qty.
       - Perbarui fungsi `handleOpenItemModal`:
         * Reset `selectedProductId` ke string kosong `''`.
         * Set default `qty` ke 1.
         * Set default `hargaBeli` ke 0.
         * Buka modal item `setIsItemModalOpen(true)`.
       - Pada modal "Tambah Barang Masuk":
         * Ganti elemen `<select>` dropdown produk dengan:
           ```tsx
           <ProductSearchAutocomplete
             products={products}
             selectedProductId={selectedProductId}
             onSelect={(prod) => {
               setSelectedProductId(prod.id);
               if (prod.buy_price !== undefined) {
                 setHargaBeli(prod.buy_price);
               }
               // Auto-focus dan seleksi teks input Qty untuk mempercepat pengisian
               setTimeout(() => {
                 qtyInputRef.current?.focus();
                 qtyInputRef.current?.select();
               }, 50);
             }}
             placeholder="Cari nama produk atau ketik/scan barcode/SKU..."
             autoFocus={true}
           />
           ```
         * Tambahkan `ref={qtyInputRef}` pada elemen `<input type="number" ... value={qty} />`.
         * Pastikan validasi submit `handleAddItem` tetap aman (memeriksa `if (!selectedProductId) return;`).
       - Pastikan dropdown autocomplete tidak terpotong oleh `overflow-hidden` modal:
         * Sesuaikan pembungkus modal jika diperlukan agar dropdown mengapung leluasa (`relative` container atau penyesuaian overflow pada body modal).
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Elemen select bawaan pada modal Tambah Barang Masuk berhasil digantikan dengan ProductSearchAutocomplete, auto-fill harga beli bekerja, dan auto-focus berpindah mulus ke input Qty.
  </done>
</task>

## Success Criteria
- [ ] Dropdown native `<select>` pada modal Tambah Barang Masuk digantikan oleh `ProductSearchAutocomplete`.
- [ ] Input pencarian produk otomatis menerima fokus saat modal dibuka (`autoFocus`).
- [ ] Memilih produk dari dropdown otomatis mengisi `selectedProductId`, `hargaBeli`, dan memindahkan fokus ke input `Qty`.
- [ ] Alur penambahan barang ke daftar faktur pembelian (`handleAddItem`) berjalan normal tanpa regresi fungsional.

