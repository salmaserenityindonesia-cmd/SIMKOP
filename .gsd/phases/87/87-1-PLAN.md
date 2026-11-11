---
phase: 87
plan: 1
wave: 1
gap_closure: false
---

# Plan 87.1: Implement Multiples of 6 Months Tenor Logic & Update Tests

## Objective
Membakukan opsi pilihan tenor pada formulir Pengajuan Pinjaman Baru (`src/pages/admin/PengajuanPinjaman.tsx`) menjadi kelipatan 6 bulan (6, 12, 18, 24, 30, dst. hingga batas maksimal produk pinjaman yang dipilih) menggantikan perulangan linier 1 s/d N bulan, mereset state tenor bila tidak sesuai dengan daftar kelipatan saat jenis pinjaman berganti, serta menyelaraskan seluruh suite unit test di `src/pages/admin/PengajuanPinjaman.test.tsx`.

## Context
Load these files for context:
- src/pages/admin/PengajuanPinjaman.tsx
- src/pages/admin/PengajuanPinjaman.test.tsx

## Tasks

<task type="auto">
  <name>Update calculateAvailableTenors and Tenor Selection Logic in PengajuanPinjaman.tsx</name>
  <files>src/pages/admin/PengajuanPinjaman.tsx</files>
  <action>
    - Buka `src/pages/admin/PengajuanPinjaman.tsx`:
      1. Perbarui fungsi murni `calculateAvailableTenors`:
         ```typescript
         export const calculateAvailableTenors = (maxTenor?: number): number[] => {
           if (typeof maxTenor !== 'number' || maxTenor <= 0) return [];
           if (maxTenor < 6) return [maxTenor];
           const tenors: number[] = [];
           for (let t = 6; t <= maxTenor; t += 6) {
             tenors.push(t);
           }
           return tenors.length > 0 ? tenors : [6];
         };
         ```
      2. Perbarui `handleLoanTypeChange`:
         - Saat jenis pinjaman berganti, dapatkan `newAvailableTenors = calculateAvailableTenors(newType?.max_duration_months)`.
         - Jika `tenor` saat ini bernilai angka dan tidak termasuk dalam `newAvailableTenors`, reset `setTenor('')` agar pengguna memilih tenor yang valid untuk jenis pinjaman baru tersebut.
      3. Pastikan elemen `<select>` dropdown tenor tetap terikat ke `availableTenors` dan memvalidasi `maxTenor`.
  </action>
  <verify>
    Jalankan TypeScript typecheck: `npx tsc --noEmit`.
  </verify>
</task>

<task type="auto">
  <name>Update Unit Tests in PengajuanPinjaman.test.tsx</name>
  <files>src/pages/admin/PengajuanPinjaman.test.tsx</files>
  <action>
    - Buka `src/pages/admin/PengajuanPinjaman.test.tsx`:
      1. Perbarui blok `describe('calculateAvailableTenors helper')`:
         - `calculateAvailableTenors()` -> return `[]`
         - `calculateAvailableTenors(6)` -> return `[6]`
         - `calculateAvailableTenors(12)` -> return `[6, 12]`
         - `calculateAvailableTenors(36)` -> return `[6, 12, 18, 24, 30, 36]`
      2. Perbarui blok `describe('Dynamic Loan Types & Tenor Filtering Form Integration')`:
         - Untuk pinjaman DARURAT (maks. 6 bulan):
           * Opsi harus memuat `<option value="6">6 Bulan</option>`.
           * Opsi TIDAK boleh memuat tenor ganjil/non-kelipatan 6 seperti `<option value="1">1 Bulan</option>`, `<option value="2">2 Bulan</option>`, `<option value="7">7 Bulan</option>`, `<option value="12">12 Bulan</option>`.
         - Untuk pinjaman REGULER (maks. 12 bulan):
           * Opsi harus memuat `<option value="6">6 Bulan</option>` dan `<option value="12">12 Bulan</option>`.
           * Opsi TIDAK boleh memuat tenor non-kelipatan 6 seperti 1, 2, 3, 4, 5, 7, 8, 9, 10, 11 Bulan, serta tidak memuat tenor > 12 bulan (18, 24, 30, 36 Bulan).
  </action>
  <verify>
    Jalankan test: `npx vitest run src/pages/admin/PengajuanPinjaman.test.tsx` dan pastikan seluruh test lulus 100%.
  </verify>
</task>

## Success Criteria
- [ ] Opsi tenor pinjaman baru hanya menampilkan angka kelipatan 6 bulan (6, 12, 18, 24, dst.) sampai batas maksimal produk.
- [ ] Dropdown tenor otomatis ter-reset saat pengguna beralih jenis pinjaman jika tenor sebelumnya tidak terdapat pada kelipatan yang valid.
- [ ] Seluruh unit test di `src/pages/admin/PengajuanPinjaman.test.tsx` lulus 100%.

