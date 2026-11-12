# Plan 93.1 Summary: Non-Destructive Print Trigger & Optimasi CSS 1 Halaman Ukuran F4

## Objective Accomplished
Menghilangkan bug reset data anggota terpilih (`selectedMember`) saat dialog print dibatalkan atau selesai dicetak di `/admin/clearance`, serta mengoptimalkan template lembar cetak settlement kliring (`ClearancePrintTemplate.tsx`) agar muat presisi dalam 1 halaman kertas ukuran F4/Folio (215mm x 330mm) tanpa terpotong tanda tangan di halaman kedua.

## Changes Made
1. **`src/pages/admin/SettlementClearance.tsx`**:
   - Menghapus manipulasi destruktif `document.body.innerHTML = printContent` dan `window.location.reload()`.
   - Mengubah `handlePrint` menjadi non-destruktif dengan `e?.preventDefault()`, `e?.stopPropagation()`, dan langsung memanggil `window.print()`.
   - Menambahkan atribut eksplisit `type="button"` pada tombol cetak dan tombol aksi lainnya untuk mencegah implicit form submit.
   - Memindahkan wrapper komponen cetak `<ClearancePrintTemplate>` ke level terpisah dengan kelas selektif `hidden print:block` dan membungkus elemen interaktif SPA dengan `print:hidden`.

2. **`src/components/settlement/ClearancePrintTemplate.tsx`**:
   - Menambahkan aturan `@media print` terintegrasi dengan ukuran kertas F4 (`@page { size: 215mm 330mm; margin: 8mm 12mm 8mm 12mm; }`).
   - Menyembunyikan elemen non-cetak (`aside`, `header`, `nav`, `.print:hidden`) dan memastikan kontainer utama `#printable-settlement` tampil penuh dan tepat di posisi cetak.
   - Merampingkan padding kontainer dokumen (dari `p-8` dan `min-h-screen` menjadi `p-2` / `print:p-0`).
   - Merampingkan kop surat koperasi (`mb-3 pb-2`), identitas anggota (`mb-2 text-xs`), cell padding tabel simpanan & pinjaman (`py-1 px-2 text-xs`).
   - Merampingkan blok perhitungan net settlement (`p-2.5 mb-3`).
   - Mengatur blok tanda tangan dengan `break-inside-avoid print:break-inside-avoid`, `mt-4 print:mt-4`, dan `mb-10 print:mb-10` sehingga seluruh dokumen muat rapi dalam 1 halaman F4 tanpa terpotong ke halaman 2.

## Verification
- TypeScript check (`npx tsc --noEmit`): Lulus tanpa error (Exit code: 0).
- Production build (`npm run build`): Lulus tanpa error (Vite production build sukses dalam 1.17s).
- State persistence: Handler `window.print()` tidak lagi memanipulasi DOM atau me-reload halaman sehingga data anggota aktif tetap utuh.

## Commits
- `c8a16184`: `feat(phase-93): prevent state reset and form reload on print action`
- `b393825c`: `feat(phase-93): configure F4 page size and compact clearance print layout`

## Deviations
None.
