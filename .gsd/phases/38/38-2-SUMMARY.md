# Plan 38.2 Summary: UI Switcher Ukuran Kertas di PengaturanKasir.tsx & Responsive Layout di ReceiptModal.tsx

## Objective
Menyediakan antarmuka interaktif pemilihan ukuran kertas printer thermal (58mm vs 80mm) pada menu Admin Pengaturan Kasir (`src/pages/admin/PengaturanKasir.tsx`), serta mengadaptasi komponen `ReceiptModal.tsx` agar merespons konfigurasi tersebut secara dinamis (lebar kontainer preview, tipografi, susunan baris item, label tombol direct print, dan style `@media print`).

## Execution Details
- **Task 1**: Add Paper Size Switcher in PengaturanKasir.tsx
  - **Files Modified**: `src/pages/admin/PengaturanKasir.tsx`
  - **Commit**: `40c1d6ea` - `feat(phase-38): add paper size switcher in PengaturanKasir`
- **Task 2**: Adapt ReceiptModal and Print CSS for Dynamic 58mm vs 80mm Layout
  - **Files Modified**: `src/components/pos/ReceiptModal.tsx`
  - **Commit**: `7516d6e6` - `feat(phase-38): adapt ReceiptModal and print CSS for dynamic 58mm vs 80mm layout`

### Changes Made
1. **Interactive Paper Size Switcher (`src/pages/admin/PengaturanKasir.tsx`)**:
   - Menambahkan import ikon `Printer` dari `lucide-react`.
   - Menambahkan seksi "Format Ukuran Kertas Printer Thermal Kasir" di antara persentase diskon anggota dan toggle stok minus.
   - Menyediakan 2 kartu opsi interaktif:
     - **58mm (Kompak / Mini)**: Printer thermal portable/Bluetooth atau USB mini, ~32 karakter per baris, format ringkas hemat kertas.
     - **80mm (Standar Desktop)**: Printer thermal kasir desktop standar, ~48 karakter per baris, tampilan lega komprehensif.
   - Terkoneksi ke `form.receipt_paper_size` dengan fallback `'80mm'`.
   - Handler `loadSettings` dan `handleReset` menormalkan nilai `receipt_paper_size` ke `'80mm'` bila belum terset.
2. **Dynamic Receipt Layout & Print CSS (`src/components/pos/ReceiptModal.tsx`)**:
   - Menerima props opsional `paperSize?: '58mm' | '80mm'`.
   - Memuat setting `receipt_paper_size` via `getPosSettings()` secara asinkron saat modal dibuka (`isOpen = true`).
   - Lebar dan tipografi kontainer struk menyesuaikan ukuran:
     - **58mm**: `max-w-[260px] p-3 text-[10px]` dengan nama produk di baris atas dan `qty x harga` + subtotal di baris kedua (`text-[9.5px]`).
     - **80mm**: `max-w-[340px] p-5 text-[12px]` standar sejajar.
   - Label tombol cetak thermal dinamis: `Direct Thermal Print (${paperSize})`.
   - Update blok `<style>` `@media print`:
     - `@page { size: ${paperSize} auto; margin: 0; }`
     - `#printable-receipt` print width: `${paperSize}` dengan padding presisi (`paperSize === '58mm' ? '2mm 3mm' : '3mm 4mm'`) dan centering rapi.

## Verification Evidence
- **TypeScript Static Check**: `npx tsc --noEmit` exited with code 0 (clean, no type errors).
- **Pattern Verification**:
  - `Select-String -Path src/pages/admin/PengaturanKasir.tsx -Pattern "receipt_paper_size","58mm","80mm"` confirmed presence and correct bindings.
  - `Select-String -Path src/components/pos/ReceiptModal.tsx -Pattern "paperSize","Direct Thermal Print \(\$\{paperSize\}\)"` confirmed presence, dynamic label, and print css rules.
- **Full Test Suite**: `npm test -- --run` passed 18/18 test suites, 193/193 tests passed (100%).
- **Git Commits**:
  - `40c1d6ea` feat(phase-38): add paper size switcher in PengaturanKasir
  - `7516d6e6` feat(phase-38): adapt ReceiptModal and print CSS for dynamic 58mm vs 80mm layout
