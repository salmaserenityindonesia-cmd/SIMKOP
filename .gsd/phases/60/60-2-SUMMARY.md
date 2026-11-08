# Summary Plan 60.2: Render Colored Numeric Installments and Status Legend in LoanMatrix.tsx

## Objective
Mengganti ikon checklist di dalam sel tabel matriks pinjaman bulanan (`LoanMatrix.tsx`) menjadi tampilan angka nominal angsuran dengan penanda warna status dinamis (Emerald untuk Lunas, Amber untuk Parsial, Rose untuk Menunggak, Slate dashed untuk Proyeksi, dan Strip untuk di luar periode pinjaman), menyertakan rich tooltip informatif, serta menambahkan legenda status di atas tabel matriks.

## Executed Tasks
1. **Implement Nominal Formatter, Status Badge Resolver & Status Legend**
   - File: `src/pages/admin/LoanMatrix.tsx`
   - Mengekspor helper `formatAmount` untuk pemformatan angka nominal ke standar ribuan Indonesia (`toLocaleString('id-ID')`) dengan fallback `'-'` untuk nilai nol/kosong.
   - Mengimplementasikan helper `getCellBadge` yang menormalisasi status pinjaman (case-insensitive) dan menghasilkan:
     - Lunas (`PAID`, `FINISHED`): Badge warna hijau (`text-emerald-700 bg-emerald-50 border-emerald-200 font-semibold`) dengan nominal terbayar.
     - Parsial (`PARTIAL`): Badge warna kuning (`text-amber-700 bg-amber-50 border-amber-200 font-semibold`) dengan nominal terbayar.
     - Menunggak (`UNPAID`): Badge warna merah (`text-rose-700 bg-rose-50 border-rose-200 font-bold`) dengan target nominal tertunggak.
     - Proyeksi (`PROJECTED`): Badge garis putus-putus abu-abu (`text-slate-400 bg-slate-50 border-dashed border-slate-200 font-normal`) dengan nominal proyeksi target.
     - Di Luar Masa Tenor (`NONE`): Tampilan strip abu-abu (`-`).
   - Menggantikan rendering checklist ikonik (`getCellIcon`) di tabel dengan badge angka nominal dan tooltip yang menampilkan No. Pinjaman, Status, Tenor, Jatuh Tempo, Target, Terbayar, dan Sisa Angsuran.
   - Menambahkan komponen **Keterangan Status** (Status Legend) tepat di atas tabel matriks pinjaman.
   - Memastikan lebar minimum kolom bulan `min-w-[110px]` agar angka nominal tidak terpotong.
   - Commit: `3bab6ac2` (`feat(phase-60): implement nominal formatter, status badge resolver, and status legend in LoanMatrix`)

2. **Update and Expand LoanMatrix.test.tsx for Colored Numbers and Legend**
   - File: `src/pages/admin/LoanMatrix.test.tsx`
   - Memperbarui `mockSummaryData` dengan properti `targetAmount`, `paidAmount`, `dueDate`, `periodNumber`, dan `tenor`.
   - Menambahkan unit testing untuk `formatAmount`:
     - Pemformatan angka positif ribuan (`1.000.000`, `50.000`, `2.500`).
     - Penanganan nilai `0`, `undefined`, `null`, dan `NaN` yang mengembalikan `'-'`.
   - Menambahkan unit testing untuk `getCellBadge`:
     - Validasi status Lunas (PAID / FINISHED) dengan kelas emerald dan label 'Lunas'.
     - Validasi status Parsial (PARTIAL) dengan kelas amber dan label 'Parsial'.
     - Validasi status Menunggak (UNPAID) dengan kelas rose dan label 'Menunggak'.
     - Validasi status Proyeksi (PROJECTED) dengan kelas slate dashed dan label 'Proyeksi'.
     - Validasi status Di Luar Masa Tenor (NONE) dengan kelas slate-300 dan label 'Di Luar Masa Tenor'.
     - Validasi case-insensitivity terhadap status lowercase (`paid`, `partial`, `unpaid`, `projection`).
   - Menambahkan pengujian render markup untuk memastikan elemen Legenda Status (`Keterangan Status:`, `Lunas`, `Parsial`, `Menunggak`, `Proyeksi`, `Di Luar Masa Tenor`) dirender dengan tepat.
   - Commit: `2d206fae` (`feat(phase-60): update and expand LoanMatrix tests for colored numbers and legend`)

## Verification Results
- `npx tsc --noEmit`: Lulus tanpa error tipe.
- `npx vitest run src/pages/admin/LoanMatrix.test.tsx`: 17 tests passed (100%).

## Deviations
None.

## Commits
- `3bab6ac2`
- `2d206fae`
