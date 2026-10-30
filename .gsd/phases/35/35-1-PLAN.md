---
phase: 35
plan: 1
wave: 1
gap_closure: false
---

# Plan 35.1: Penyelarasan Layout Tombol Header Laporan Mutasi Barang

## Objective
Menyelaraskan seluruh tombol aksi header pada halaman Laporan Mutasi Barang Gudang (`src/pages/admin/LaporanMutasiBarang.tsx`) ke dalam satu baris horizontal (`flex-row`), dengan ukuran tinggi, padding, ikon, dan gap yang simetris dan konsisten sehingga tombol "Cetak PDF" tidak terlipat atau bertingkat ke baris bawah pada layar desktop/laptop.

## Context
Load these files for context:
- src/pages/admin/LaporanMutasiBarang.tsx

## Tasks

<task type="auto">
  <name>Refactor Header Action Buttons into Symmetric Flex Row</name>
  <files>
    src/pages/admin/LaporanMutasiBarang.tsx
  </files>
  <action>
    1. Buka berkas komponen `src/pages/admin/LaporanMutasiBarang.tsx`.
    2. Temukan kontainer header dan pembungkus tombol aksi (Refresh/Perbarui, Export Excel, dan Cetak PDF).
    3. Perbarui struktur kontainer aksi dari flex-wrap yang menyebabkan tombol terlipat menjadi flex horizontal (`shrink-0` dan `flex-row items-center gap-2.5`):
       - Refresh Button:
         - Menggunakan tinggi dan lebar seragam `h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs`.
         - Ikon `RefreshCcw` dengan indikator spin saat `loading`.
         - Tooltip `title="Perbarui Data Mutasi"`.
       - Export Excel Button:
         - Menggunakan tinggi seragam `h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-xs`.
         - Ikon `FileSpreadsheet` (atau `Loader2` saat `exporting`).
         - Label `<span>Export Excel</span>`.
       - Cetak PDF Button:
         - Menggunakan tinggi seragam `h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-xs`.
         - Ikon `Printer` (atau `Loader2` saat `exporting`).
         - Label `<span>Cetak PDF</span>`.
    4. Pastikan kontainer utama header (`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`) memberikan alokasi ruang yang cukup bagi judul & deskripsi di sebelah kiri dan aksi di sebelah kanan agar tidak saling bertabrakan atau terlipat vertikal pada resolusi layar laptop/desktop.
    5. Jaga fungsi interaktif `fetchData`, `handleExportExcel`, `handlePrintPdf`, serta state disable saat loading atau tidak ada mutasi.
  </action>
  <verify>
    Periksa berkas `src/pages/admin/LaporanMutasiBarang.tsx`:
    - Kontainer tombol aksi memiliki kelas `flex items-center gap-2.5 shrink-0`.
    - Ketiga tombol (Refresh, Export Excel, Cetak PDF) memiliki tinggi seragam `h-10` dan rounded `rounded-lg`.
    - Tombol Cetak PDF dan Export Excel berada dalam kontainer yang sama dan sejajar horizontal.
  </verify>
  <done>
    Tombol aksi header laporan mutasi tersusun simetris, konsisten, dan berjejer rapi dalam satu baris horizontal tanpa wrap yang tidak rapi.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tombol Refresh, Export Excel, dan Cetak PDF berada dalam satu baris horizontal sejajar (`flex-row`).
- [ ] Ketiga tombol memiliki tinggi seragam (`h-10`) dan rounded konsisten (`rounded-lg`).
- [ ] Status loading dan handler event (`fetchData`, `handleExportExcel`, `handlePrintPdf`) berfungsi normal.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Visual alignment is symmetrical and consistent
