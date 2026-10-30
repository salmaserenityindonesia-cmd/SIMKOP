---
phase: 38
plan: 2
wave: 2
depends_on: [38-1]
gap_closure: false
---

# Plan 38.2: UI Switcher Ukuran Kertas di PengaturanKasir.tsx & Responsive Layout di ReceiptModal.tsx

## Objective
Menyediakan antarmuka interaktif pemilihan ukuran kertas printer (58mm vs 80mm) pada menu Admin Pengaturan Kasir (`src/pages/admin/PengaturanKasir.tsx`), serta mengadaptasi komponen `ReceiptModal.tsx` agar merespons konfigurasi tersebut secara dinamis (lebar kontainer, tipografi, susunan baris item, label tombol direct print, dan style `@media print`).

## Context
Load these files for context:
- `src/pages/admin/PengaturanKasir.tsx` (L230-355: form controls, save/reset handlers)
- `src/components/pos/ReceiptModal.tsx` (L35-68, L92-247: receipt container, typography, print styles)
- `src/services/posSettingsService.ts` (`getPosSettings`, `updatePosSettings`, `POSSettings`)

## Findings That Shape This Plan
1. **Interactive Selector**: Pengaturan ukuran kertas paling jelas disajikan dalam bentuk 2 kartu pilihan (Radio Cards):
   - **Kertas 58 mm (Kompak / Mini)**: Portable thermal printer Bluetooth/USB, ~32 karakter per baris, hemat kertas.
   - **Kertas 80 mm (Standar Desktop)**: Desktop thermal printer kasir, ~48 karakter per baris, tampilan lebih lega.
2. **Responsive Struk Kasir**:
   - Untuk **58mm**: Lebar kontainer struk dipersempit (`max-w-[260px]` atau `w-[58mm]`), font lebih ringkas (`text-[10px] leading-tight`, padding `p-3`). Baris barang belanjaan dibuat 2 baris (baris 1: nama barang; baris 2: `qty x harga` dan `subtotal` di sisi kanan) agar tidak terpotong.
   - Untuk **80mm**: Lebar standar (`max-w-[340px]`), font `text-[12px]`, padding `p-5`. Baris barang berdampingan.
3. **Tombol Cetak**: Label tombol berubah dinamis menjadi `Direct Thermal Print (58mm)` atau `Direct Thermal Print (80mm)`.
4. **CSS Print Rules**: Update `@media print` agar menyertakan `@page { size: ${paperSize} auto; margin: 0; }` dan mengatur lebar cetak `#printable-receipt` sesuai ukuran aktif (58mm atau 80mm).

## Tasks

<task type="auto">
  <name>Add Paper Size Switcher in PengaturanKasir.tsx</name>
  <files>
    src/pages/admin/PengaturanKasir.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/PengaturanKasir.tsx`.
    2. Import ikon `Printer` dari `lucide-react`.
    3. Di dalam formulir pengaturan transaksi POS (di antara diskon anggota dan toggle stok minus), tambahkan seksi:
       **"Format Ukuran Kertas Printer Thermal Kasir"**:
       - Berikan 2 card selector interaktif untuk `'58mm'` dan `'80mm'`.
       - Tampilkan visual radio indicator aktif, badge ukuran, ikon printer, dan penjelasan spesifikasi.
       - Kaitkan ke `form.receipt_paper_size` (dengan fallback `'80mm'`).
    4. Pastikan handler `handleReset` mengembalikan `receipt_paper_size` ke nilai `initialData.receipt_paper_size || '80mm'`.
  </action>
  <verify>npx tsc --noEmit; Select-String -Path src/pages/admin/PengaturanKasir.tsx -Pattern "receipt_paper_size","58mm","80mm"</verify>
  <done>Pilihan ukuran kertas 58mm vs 80mm tampil rapi pada halaman Pengaturan Kasir dan tersimpan saat form di-submit.</done>
</task>

<task type="auto">
  <name>Adapt ReceiptModal and Print CSS for Dynamic 58mm vs 80mm Layout</name>
  <files>
    src/components/pos/ReceiptModal.tsx
  </files>
  <action>
    1. Buka `src/components/pos/ReceiptModal.tsx`.
    2. Tambahkan pemanggilan `getPosSettings()` pada `useEffect` saat `isOpen` true untuk memuat `receipt_paper_size` (state `paperSize`: `'58mm' | '80mm'`, default `'80mm'`).
    3. Sesuaikan layout kartu struk berdasarkan `paperSize`:
       - Kontainer preview struk: `paperSize === '58mm' ? 'max-w-[260px] p-3 text-[10px]' : 'max-w-[340px] p-5 text-[12px]'`.
       - Rincian item belanja (`cart.map`):
         * Pada `58mm`: Baris 1 nama barang (break-words), Baris 2 `qty x harga` di kiri dan subtotal di kanan dengan ukuran font proporsional.
         * Pada `80mm`: Tampilan standar yang sudah ada.
       - Label tombol cetak thermal:
         `Direct Thermal Print (${paperSize})`.
    4. Perbarui blok `<style>` `@media print`:
       - Terapkan `@page { size: ${paperSize} auto; margin: 0; }`.
       - Atur `#printable-receipt` saat print dengan `width: ${paperSize}; max-width: ${paperSize}; margin: 0 auto; padding: ${paperSize === '58mm' ? '2mm 3mm' : '3mm 4mm'};`.
  </action>
  <verify>npx tsc --noEmit; Select-String -Path src/components/pos/ReceiptModal.tsx -Pattern "paperSize","Direct Thermal Print \(\$\{paperSize\}\)"</verify>
  <done>ReceiptModal responsif terhadap pengaturan ukuran kertas 58mm vs 80mm di layar maupun saat dicetak ke printer thermal.</done>
</task>

## Success Criteria
- [ ] Opsi 58mm dan 80mm di `PengaturanKasir.tsx` dapat dipilih dan nilainya tersimpan.
- [ ] `ReceiptModal.tsx` secara otomatis mendeteksi ukuran kertas yang dipilih.
- [ ] Tampilan preview struk dan label tombol cetak menyesuaikan ukuran 58mm atau 80mm.
- [ ] Rule CSS `@media print` mendefinisikan `@page size` dan lebar struk sesuai ukuran aktif.
