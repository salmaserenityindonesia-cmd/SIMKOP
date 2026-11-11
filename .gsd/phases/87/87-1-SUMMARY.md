# Phase 87 Plan 1 Summary: Multiples of 6 Months Tenor Logic & Unit Tests

## Overview
Membakukan opsi pilihan tenor pada formulir Pengajuan Pinjaman Baru (`src/pages/admin/PengajuanPinjaman.tsx`) menjadi kelipatan 6 bulan (6, 12, 18, 24, 30, dst. hingga batas maksimal produk pinjaman yang dipilih) menggantikan perulangan linier 1 s/d N bulan, mereset state tenor bila tidak sesuai dengan daftar kelipatan saat jenis pinjaman berganti, serta menyelaraskan seluruh suite unit test di `src/pages/admin/PengajuanPinjaman.test.tsx`.

## Tasks Completed

| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| Task 1 | Update `calculateAvailableTenors` and Tenor Selection Logic in `PengajuanPinjaman.tsx` | Completed | `3aa78371` |
| Task 2 | Update Unit Tests in `PengajuanPinjaman.test.tsx` | Completed | `4f68bec1` |

## Changes Implemented

### 1. `src/pages/admin/PengajuanPinjaman.tsx`
- Memperbarui fungsi murni `calculateAvailableTenors`:
  - Jika `maxTenor` tidak valid atau `<= 0`, return `[]`.
  - Jika `maxTenor < 6`, return `[maxTenor]`.
  - Mengiterasi `for (let t = 6; t <= maxTenor; t += 6)` sehingga opsi tenor hanya kelipatan 6 bulan.
  - Return `tenors.length > 0 ? tenors : [6]`.
- Memperbarui `handleLoanTypeChange`:
  - Menghitung `newAvailableTenors = calculateAvailableTenors(newType?.max_duration_months)`.
  - Mereset `setTenor('')` jika `tenor` saat ini bernilai angka dan tidak termasuk dalam `newAvailableTenors` yang diizinkan untuk jenis pinjaman baru.

### 2. `src/pages/admin/PengajuanPinjaman.test.tsx`
- Memperbarui `describe('calculateAvailableTenors helper')`:
  - `calculateAvailableTenors()` -> `[]`
  - `calculateAvailableTenors(6)` -> `[6]`
  - `calculateAvailableTenors(12)` -> `[6, 12]`
  - `calculateAvailableTenors(36)` -> `[6, 12, 18, 24, 30, 36]`
- Memperbarui `describe('Dynamic Loan Types & Tenor Filtering Form Integration')`:
  - Untuk pinjaman DARURAT (maks. 6 bulan): memuat `6 Bulan` dan tidak memuat `1`, `2`, `3`, `4`, `5`, `7`, `10`, `12`, `18`, `24`, `36 Bulan`.
  - Untuk pinjaman REGULER (maks. 12 bulan): memuat `6 Bulan` dan `12 Bulan`, serta tidak memuat tenor non-kelipatan 6 (`1` s/d `5`, `7` s/d `11`) maupun tenor di atas 12 bulan (`18`, `24`, `30`, `36`).

## Verification
- TypeScript type check (`npx tsc --noEmit`): Exit code 0 (no errors).
- Vitest unit tests (`npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx`): 36 passing tests (100% pass).

## Deviations
None.
