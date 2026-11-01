---
phase: 40
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 40.1: Pemetaan Data As-Is Murni Tanpa Rumus Komputasi di Parser Migrasi Anggota

## Objective
Mengubah parser migrasi Excel (`src/services/memberExcelService.ts`) agar membaca dan menyimpan data secara as-is (murni apa adanya dari berkas Excel) tanpa menerapkan pembagian simpanan wajib bulanan atau komputasi DATEDIF. Nilai `jumlah_simpanan_wajib` dicatat utuh dan `tgl_awal_pinjaman` mempertahankan nilai murni dari kolom Excel.

## Context
- `src/services/memberExcelService.ts` (`MigrationRowData`, `parseMemberUpload`, `executeMigration`)
- `src/services/memberExcelService.test.ts`

## Tasks

<task type="auto">
  <name>Refactor Member Excel Service to Pure As-Is Mapping</name>
  <files>
    src/services/memberExcelService.ts
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`:
       - Pada interface `MigrationRowData`:
         * Pertahankan field `tgl_awal_pinjaman: string | null;` (dapat berupa tanggal string atau nilai representasi teks/angka asli dari Excel).
         * Pastikan `jumlah_simpanan_wajib`, `jumlah_simpanan_belanja`, `jumlah_simpanan_lebaran`, dan `jumlah_simpanan_pokok` mencatat angka murni apa adanya dari kolom Excel.
       - Pada fungsi `parseMemberUpload`:
         * Untuk `tgl_awal_pinjaman`: Jangan gunakan parser tanggal yang membatalkan nilai non-tanggal standar jika pengguna menginput angka seperti 10, 33, 25, 5. Gunakan helper pembaca nilai murni:
           `const rawTglPinj = getVal('tgl_awal_pinjaman'); const tgl_awal_pinjaman = rawTglPinj !== null && rawTglPinj !== undefined ? String(rawTglPinj).trim() : null;`
         * Hapus pembagian simpanan wajib per bulan (`wajib_per_bulan = Math.floor(jumlah_simpanan_wajib / n_bulan_simpanan)`). Set `wajib_per_bulan = jumlah_simpanan_wajib` (utuh apa adanya).
         * Set `belanja_per_bulan = jumlah_simpanan_belanja` dan `lebaran_per_bulan = jumlah_simpanan_lebaran`.
         * Pertahankan `n_bulan_simpanan = 1` atau durasi default tanpa memecah nominal.
       - Pada fungsi `executeMigration`:
         * Saat mencatat transaksi simpanan rutin (`deposit_transactions`), catat satu mutasi saldo migrasi utuh (`amount: dt.amount`) dengan deskripsi "Migrasi Saldo Awal (As-Is)" tanpa memecahnya menjadi perulangan bulanan kecil, atau catat sebagai saldo total langsung, sehingga total saldo simpanan wajib anggota langsung sesuai dengan angka di Excel.
         * Untuk pembuatan pinjaman, jika `tgl_awal_pinjaman` berupa tanggal valid, gunakan tanggal tersebut. Jika berupa angka (seperti 10 atau 33), jadikan catatan / disbursed_at default ke tanggal awal anggota atau tanggal saat ini, dengan tanggal/siklus asli tersimpan aman di notes pinjaman.
  </action>
  <verify>
    File `template_migrasi_anggota_v2(2).xlsx` diparsing:
    - Joko Ramadhan: `jumlah_simpanan_wajib` = 2000000, `tgl_awal_pinjaman` = '10'.
    - Asep Saputra: `jumlah_simpanan_wajib` = 6600000, `tgl_awal_pinjaman` = '33'.
  </verify>
  <done>Parser membaca data secara murni sesuai file Excel tanpa rumus pembagian.</done>
</task>
