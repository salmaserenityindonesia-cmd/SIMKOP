# Summary Plan 72.1: Reverse Chronological Breakdown & Difference Validator in Migration Parser

## Accomplishments
- Mendefinisikan interface `TierRate`, `MonthlyBreakdownItem`, dan `ReverseWajibBreakdownResult` di `src/utils/memberMigrationParser.ts`.
- Mengimplementasikan mesin `computeReverseWajibBreakdown`:
  - Mengurai mundur per bulan dari bulan berjalan (`currentDate`) ke belakang hingga `tgl_awal_anggota`.
  - Mengabaikan penguraian bulanan untuk periode historis pra-Januari 2020 (`cutoff2020`) dan menyimpannya sebagai saldo utuh lump-sum (`pre2020LumpSum`).
  - Menghitung kecocokan terhadap konfigurasi tarif bertingkat (`tiers`), menghitung `calculatedTotal`, serta mengevaluasi selisih (`difference`) dan penanda `hasDifference`.
- Menambahkan 5 kasus uji unit komprehensif di `src/utils/memberMigrationParser.test.ts` yang mencakup:
  - Penguraian mundur multi-tier dengan selisih 0.
  - Deteksi selisih positif (kelebihan) dan negatif (defisit) pada anggota pasca-2020.
  - Penanganan batas cutoff pra-2020 dengan penyimpanan saldo utuh.
  - Deteksi defisit pada anggota pra-2020 jika nilai Excel lebih kecil dari uraian >= 2020.
  - Penanganan join date bernilai null atau tidak valid secara elegan.
- Semua 20 pengujian unit di `memberMigrationParser.test.ts` lulus 100%.

## Commit
- `64e6c20c`: `feat(phase-72): implement reverse chronological breakdown and discrepancy calculator in migration parser`

