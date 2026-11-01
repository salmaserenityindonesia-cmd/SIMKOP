# Phase 40 Plan 1 Summary: Pemetaan Data As-Is Murni Tanpa Rumus Komputasi di Parser Migrasi Anggota

## Objective
Mengubah parser migrasi Excel (`src/services/memberExcelService.ts`) agar membaca dan menyimpan data secara as-is (murni apa adanya dari berkas Excel) tanpa menerapkan pembagian simpanan wajib bulanan atau komputasi DATEDIF. Nilai `jumlah_simpanan_wajib` dicatat utuh dan `tgl_awal_pinjaman` mempertahankan nilai murni dari kolom Excel.

## Key Changes
1. **`src/services/memberExcelService.ts`**:
   - `parseMemberUpload`:
     - Membaca nilai murni `tgl_awal_pinjaman` langsung dari cell tanpa memaksa `parseDate`, sehingga nilai angka/teks non-tanggal (misal: "10", "33", "25", "5") tidak lagi menjadi `null`.
     - Menghilangkan rumus pembagian simpanan wajib bulanan (`wajib_per_bulan = jumlah_simpanan_wajib`, `belanja_per_bulan = jumlah_simpanan_belanja`, `lebaran_per_bulan = jumlah_simpanan_lebaran`, dan `n_bulan_simpanan = 1`).
     - Mendukung pembacaan buffer via `file.arrayBuffer()` modern dengan fallback ke `FileReader`.
   - `executeMigration`:
     - Transaksi simpanan rutin (`deposit_transactions`) tidak lagi menggunakan perulangan pembagian bulan, melainkan dicatat satu kali mutasi saldo awal migrasi utuh (`amount: dt.amount`) dengan deskripsi `'Migrasi Saldo Awal (As-Is)'`.
     - Pembuatan pinjaman (`loans`): jika `tgl_awal_pinjaman` berupa tanggal valid, digunakan untuk `disbursed_at`; jika bukan tanggal valid (misal "10" atau "33"), digunakan `new Date().toISOString()` untuk `disbursed_at` dan nilai asli Excel dicatat pada kolom `notes`.
2. **`src/services/memberExcelService.test.ts`**:
   - Menambahkan unit test komprehensif untuk `parseMemberUpload` yang memverifikasi bahwa Joko Ramadhan (`wajib`: 2.000.000, `tgl_awal_pinjaman`: '10') dan Asep Saputra (`wajib`: 6.600.000, `tgl_awal_pinjaman`: '33') diparsing secara as-is tanpa pembagian.
   - Menambahkan unit test untuk `executeMigration` yang memverifikasi transaksi saldo migrasi utuh dan penanganan pinjaman non-tanggal yang aman.

## Verification Evidence
- **Vitest Unit Test Suite**: 22 test files, 219 tests passed (100% pass).
- **TypeScript Typecheck**: `npm run typecheck` passed (exit code 0).
- **Vite Production Build**: `npm run build` completed successfully (exit code 0).

## Commits
- `962e024a`: feat(phase-40): refactor member excel service to pure as-is mapping
