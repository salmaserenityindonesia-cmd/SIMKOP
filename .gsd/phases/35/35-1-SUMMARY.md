# Plan 35.1 Summary: Penyelarasan Layout Tombol Header Laporan Mutasi Barang

## Objective
Menyelaraskan seluruh tombol aksi header pada halaman Laporan Mutasi Barang Gudang (`src/pages/admin/LaporanMutasiBarang.tsx`) ke dalam satu baris horizontal (`flex-row`), dengan ukuran tinggi, padding, ikon, dan gap yang simetris dan konsisten sehingga tombol "Cetak PDF" tidak terlipat atau bertingkat ke baris bawah pada layar desktop/laptop.

## Execution Details
- **Task**: Refactor Header Action Buttons into Symmetric Flex Row
- **Files Modified**: `src/pages/admin/LaporanMutasiBarang.tsx`
- **Commit**: `05db6068` - `feat(phase-35): refactor header action buttons into symmetric flex row`

### Changes Made
1. **Container Styling**: Diubah dari `flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto` menjadi `flex items-center gap-2.5 shrink-0`. Menghilangkan flex-wrap yang menyebabkan tombol terlipat ke baris kedua, dan menerapkan `shrink-0` agar tombol tetap berada dalam satu baris horizontal berdampingan.
2. **Refresh Button**:
   - Dikonfigurasi dengan ukuran seragam `h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs disabled:opacity-50`.
   - Ikon `RefreshCcw` dengan indikator spin saat `loading`.
   - Tooltip `title="Perbarui Data Mutasi"`.
3. **Export Excel Button**:
   - Dikonfigurasi dengan ukuran tinggi seragam `h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none`.
   - Ikon `FileSpreadsheet` / `Loader2` saat `exporting`.
   - Label `Export Excel`.
4. **Cetak PDF Button**:
   - Dikonfigurasi dengan ukuran tinggi seragam `h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50 disabled:pointer-events-none`.
   - Ikon `Printer` / `Loader2` saat `exporting`.
   - Label `Cetak PDF`.

## Verification Evidence
- TypeScript checking (`npx tsc --noEmit`) exited with code 0 (clean, no errors).
- Verifikasi visual/kode tombol:
  - Header actions container: `flex items-center gap-2.5 shrink-0`
  - Ketiga tombol sejajar horizontal dengan tinggi seragam `h-10` dan rounded `rounded-lg`.
  - Tombol Cetak PDF dan Export Excel berada dalam kontainer yang sama dan sejajar simetris.
- Git commit verification: `05db6068` confirmed.
