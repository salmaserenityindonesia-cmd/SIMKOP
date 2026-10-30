---
phase: 36
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 36.1: Autocomplete Produk Berbasis Keyboard pada Filter Mode Kartu Stok

## Objective
Mengganti `<select>` "Mode Kartu Stok (Produk)" di `src/pages/admin/LaporanMutasiBarang.tsx` dengan komponen reusable `ProductSearchAutocomplete` (Phase 31) yang mendukung pencarian real-time berdasarkan Nama/SKU/Barcode, navigasi keyboard penuh (ArrowUp/ArrowDown/Enter/Escape), opsi khusus "Semua Produk (Semua Mutasi Gudang)", dan tombol reset `X` satu klik — tanpa mengubah perilaku dua konsumen yang sudah ada (`ManajemenPembelian.tsx`, `InputReturPembelian.tsx`).

## Context
Load these files for context:
- src/components/common/ProductSearchAutocomplete.tsx
- src/components/common/ProductSearchAutocomplete.test.tsx
- src/pages/admin/LaporanMutasiBarang.tsx (state L128-213, filter grid L620-689)
- src/services/inventoryMutationService.ts (`ProductOption`, `getAllProductsForFilter`)

## Findings That Shape This Plan (do not skip)
1. **Sentinel adalah `'all'`, bukan `""`.** `selectedProductId` di halaman bernilai `'all'` dan dipakai di `fetchData` (L177) serta ekspor Excel/PDF (L315, L320, L346, L351). JANGAN ganti sentinel di halaman — petakan saja ke komponen: `selectedProductId === 'all' ? '' : selectedProductId`.
2. **Tombol `X` komponen saat ini TIDAK mereset seleksi** — `handleClear` hanya mengosongkan teks dan tidak memanggil `onSelect`. Butuh prop baru `onClear`.
3. **Komponen belum punya opsi "Semua Produk"** — butuh prop baru `allOptionLabel`.
4. **Escape saat ini meninggalkan teks ketikan** di input sehingga input tidak cocok lagi dengan filter aktif. Escape harus mengembalikan teks ke nama produk terpilih (atau kosong bila mode Semua Produk).
5. **Tipe tidak kompatibel:** `ProductOption.sku` opsional, sedangkan `ProductAutocompleteItem.sku` wajib → mapping `sku: p.sku || '-'`.
6. **Gaya visual berbeda:** komponen memakai token M3 (`bg-surface-container-lowest border-outline rounded-lg`), sedangkan filter halaman memakai `bg-slate-50 border-slate-200 rounded-xl text-sm`. Butuh prop `inputClassName` agar tinggi & tampilan sejajar dengan input tanggal/select di sebelahnya.
7. **Tidak ada `@testing-library`/jsdom** — tes yang ada memakai `renderToStaticMarkup` + helper murni. Logika baru (daftar opsi + indeks) WAJIB diekstrak ke helper murni agar bisa diuji.
8. Kartu filter (L614) tidak memakai `overflow-hidden`, jadi dropdown `absolute z-50` tidak akan terpotong.

## Tasks

<task type="auto">
  <name>Extend ProductSearchAutocomplete with All-Option, onClear, Escape-Restore & inputClassName (backward-compatible)</name>
  <files>
    src/components/common/ProductSearchAutocomplete.tsx
    src/components/common/ProductSearchAutocomplete.test.tsx
  </files>
  <action>
    1. Tambah prop OPSIONAL pada `ProductSearchAutocompleteProps` (semua default = perilaku lama):
       - `allOptionLabel?: string` — bila diisi, render baris spesial di atas daftar produk.
       - `onClear?: () => void` — dipanggil saat baris spesial dipilih ATAU tombol `X` diklik.
       - `inputClassName?: string` — bila diisi, MENGGANTIKAN kelas visual default input (`bg-surface-container-lowest border border-outline rounded-lg text-body-md ...`); kelas struktural `w-full pl-9 pr-8 py-2 outline-none transition-all` tetap dipertahankan.
    2. Ekspor helper murni baru:
       ```ts
       export type AutocompleteOption =
         | { kind: 'all'; label: string }
         | { kind: 'product'; item: ProductAutocompleteItem };

       export function buildAutocompleteOptions(
         products: ProductAutocompleteItem[],
         searchTerm: string,
         selectedProductName: string | undefined,
         allOptionLabel?: string,
         limit = 20
       ): AutocompleteOption[]
       ```
       - Produk = `filterProducts(products, searchTerm, limit)` dibungkus `{kind:'product'}`.
       - Opsi `{kind:'all'}` di-prepend HANYA bila `allOptionLabel` ada DAN pengguna tidak sedang mencari, yaitu `!searchTerm.trim() || searchTerm === selectedProductName`.
         ALASAN: saat pengguna mengetik "POSH", `onChange` mereset highlight ke indeks 0; bila opsi "Semua Produk" selalu di indeks 0, Enter akan salah memilih "Semua Produk" alih-alih hasil pencarian pertama.
    3. Refactor render & keyboard handler agar beroperasi atas `options` (hasil `buildAutocompleteOptions`) — bukan `filtered`:
       - `ArrowDown`/`ArrowUp` memakai `calculateNextHighlightedIndex(prev, options.length, key)`.
       - `Enter` pada opsi `kind:'all'` → panggil `commitClear()`; pada `kind:'product'` → `handleSelect(item)`. Pertahankan fallback "satu hasil → Enter memilihnya".
       - `Escape` → tutup dropdown, reset highlight ke -1, DAN kembalikan `searchTerm` ke `selectedProduct?.name ?? ''` (tanpa memanggil `onSelect`/`onClear` — filter tidak berubah).
       - Klik di luar (handler mousedown/touchstart yang sudah ada) → lakukan restore teks yang sama seperti Escape. Gunakan ref untuk nama produk terpilih agar listener `useEffect([])` tidak membaca nilai basi.
    4. `commitClear()` = `onClear?.()`, `setSearchTerm('')`, `setIsOpen(false)`, `setHighlightedIndex(-1)`, fokus tetap di input.
       Tombol `X`: bila `onClear` ada → `commitClear()`; bila tidak → perilaku lama `handleClear` (kosongkan teks, buka list, fokus) TIDAK BERUBAH.
       Tombol `X` juga harus tampil saat `searchTerm` kosong tetapi `selectedProductId` tidak kosong (kasus jarang, namun aman).
    5. Render baris `kind:'all'`: `role="option"`, `id="product-option-{idx}"`, ikon `Layers`/`PackageSearch` dari lucide-react, teks label, gaya highlight sama dengan baris produk; tandai aktif (mis. ikon `Check`) bila `selectedProductId === ''`. Header "Menampilkan N produk" tetap menghitung produk saja (bukan opsi all).
       Bila produk 0 tetapi opsi all ada (mis. daftar master belum termuat) → tetap tampilkan opsi all, jangan pesan "tidak ditemukan" saja.
    6. Baris produk tetap menampilkan nama, badge SKU, dan `Stok: {stock} {unit}` (sudah ada) — jangan ubah markup baris produk agar konsumen lama tak berubah tampilan.
    7. Tambah tes di `ProductSearchAutocomplete.test.tsx` (pola yang sama: helper murni + `renderToStaticMarkup`), minimal:
       - `buildAutocompleteOptions` dengan `allOptionLabel` + term kosong → `options[0].kind === 'all'` dan `options.length === products.length + 1`.
       - term "posh" → TIDAK ada opsi all; `options[0]` adalah produk POSH (kasus negatif penting untuk bug Enter).
       - term === nama produk terpilih → opsi all muncul kembali di indeks 0.
       - tanpa `allOptionLabel` → identik dengan `filterProducts` (regresi konsumen lama).
       - `renderToStaticMarkup` dengan `defaultOpen` + `allOptionLabel="Semua Produk (Semua Mutasi Gudang)"` → markup mengandung label tersebut dan `role="option"`.
       - `renderToStaticMarkup` dengan `inputClassName="bg-slate-50 rounded-xl"` → markup mengandung `bg-slate-50` dan TIDAK mengandung `bg-surface-container-lowest`.
    HINDARI: mengubah signature `onSelect`, mengubah default placeholder, atau mengganti nama/ekspor yang sudah ada (`filterProducts`, `calculateNextHighlightedIndex`, default export) — dua halaman lain bergantung padanya.
  </action>
  <verify>npx vitest run src/components/common/ProductSearchAutocomplete.test.tsx</verify>
  <done>Semua tes lama + ≥6 tes baru lulus; `buildAutocompleteOptions` terekspor; tanpa prop baru, perilaku dan markup komponen identik dengan sebelumnya.</done>
</task>

<task type="auto">
  <name>Replace Mode Kartu Stok select with ProductSearchAutocomplete in LaporanMutasiBarang</name>
  <files>
    src/pages/admin/LaporanMutasiBarang.tsx
  </files>
  <action>
    1. Import: `import ProductSearchAutocomplete, { type ProductAutocompleteItem } from '../../components/common/ProductSearchAutocomplete';` (`useMemo` sudah di-import di L1).
    2. Buat daftar ter-mapping di dalam komponen:
       ```ts
       const autocompleteProducts = useMemo<ProductAutocompleteItem[]>(
         () => productsList.map((p) => ({ id: p.id, name: p.name, sku: p.sku || '-', stock: p.stock, unit: p.unit })),
         [productsList]
       );
       ```
       JANGAN sertakan `buy_price` (laporan mutasi tidak relevan dengan harga beli; komponen hanya merender harga bila didefinisikan).
    3. Ganti blok `<select value={selectedProductId} ...>` (L676-687) dengan:
       ```tsx
       <ProductSearchAutocomplete
         products={autocompleteProducts}
         selectedProductId={selectedProductId === 'all' ? '' : selectedProductId}
         onSelect={(p) => setSelectedProductId(p.id)}
         onClear={() => setSelectedProductId('all')}
         allOptionLabel="Semua Produk (Semua Mutasi Gudang)"
         placeholder="Ketik Nama Produk atau Barcode / SKU..."
         inputClassName="text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white"
       />
       ```
       Pertahankan `<label>` "Mode Kartu Stok (Produk)" dan wrapper `<div>` grid cell yang ada sehingga grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` tetap sejajar dengan Dari Tanggal / Sampai Tanggal / Jenis Mutasi.
    4. Pembaruan data: `setSelectedProductId` sudah memicu `fetchData` lewat dependency `useCallback` + `useEffect` (L213-215) — JANGAN menambahkan pemanggilan `fetchData()` manual (akan menyebabkan fetch ganda).
    5. Tidak ada perubahan pada logika `'all'` di `fetchData`, ekspor Excel/PDF, maupun kartu "KARTU STOK PRODUK" (L534+).
  </action>
  <verify>npx tsc --noEmit; Select-String -Path src/pages/admin/LaporanMutasiBarang.tsx -Pattern "ProductSearchAutocomplete","Semua Produk \(Semua Mutasi Gudang\)" ; (Select-String -Path src/pages/admin/LaporanMutasiBarang.tsx -Pattern "value=\{selectedProductId\}").Count  # harus 0</verify>
  <done>Tidak ada lagi `<select value={selectedProductId}>`; halaman merender `ProductSearchAutocomplete` dengan opsi "Semua Produk", placeholder baru, dan `onClear` → `'all'`; `tsc --noEmit` exit 0.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Manual UI check at /admin/laporan-mutasi</name>
  <files>src/pages/admin/LaporanMutasiBarang.tsx</files>
  <action>
    `npm run dev`, buka `/admin/laporan-mutasi`:
    1. Klik kolom Mode Kartu Stok → dropdown terbuka, baris pertama "Semua Produk (Semua Mutasi Gudang)".
    2. Ketik "POSH" (atau barcode-nya) → daftar terfilter, opsi Semua Produk tersembunyi, baris pertama ter-highlight.
    3. ArrowDown/ArrowUp memindahkan highlight dan list auto-scroll → Enter → "DDR POSH SOFT & SMOOTH" terpilih, kartu "KARTU STOK PRODUK" muncul, tabel memuat ulang.
    4. Ketik teks lain lalu Escape → dropdown tertutup, teks kembali ke "DDR POSH SOFT & SMOOTH", data tidak berubah.
    5. Klik `X` → filter kembali ke Semua Produk, kartu stok hilang, tabel memuat semua mutasi.
    6. Lebar layar lg: keempat filter sejajar sama tinggi; dropdown tidak terpotong.
  </action>
  <verify>Konfirmasi visual oleh pengguna.</verify>
  <done>Keenam langkah lolos.</done>
</task>

## Success Criteria
- [ ] Filter Mode Kartu Stok dapat dioperasikan penuh dengan keyboard (ArrowUp/ArrowDown/Enter/Escape).
- [ ] Pencarian mencocokkan nama ATAU SKU/barcode, case-insensitive.
- [ ] Opsi "Semua Produk" dan tombol `X` mengembalikan `selectedProductId` ke `'all'`.
- [ ] Escape/klik di luar tidak mengubah filter dan mengembalikan teks input.
- [ ] `ManajemenPembelian.tsx` & `InputReturPembelian.tsx` tidak diubah dan perilakunya tetap.
- [ ] Tes komponen lulus, termasuk kasus negatif "opsi all tidak muncul saat mencari".

