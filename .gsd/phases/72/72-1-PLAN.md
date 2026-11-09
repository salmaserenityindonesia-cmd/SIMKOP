---
phase: 72
plan: 1
wave: 1
gap_closure: false
---

# Plan 72.1: Reverse Chronological Breakdown & Difference Validator in Migration Parser

## Objective
Membangun fungsi helper `computeReverseWajibBreakdown` dan tipe data terkait di `src/utils/memberMigrationParser.ts` serta mengekspos pengujian unit yang komprehensif di `src/utils/memberMigrationParser.test.ts`. Fungsi ini melakukan rekonsiliasi penguraian mundur (reverse chronological breakdown) dari bulan berjalan mundur ke belakang hingga tanggal awal menjadi anggota (`tgl_awal_anggota`), menghormati batas batas awal konfigurasi tarif bertingkat (misal Jan 2020), menghitung saldo historis pra-2020, dan mendeteksi selisih antara nominal simpanan wajib di Excel dengan ekspektasi sistem berbasis tarif bertingkat.

## Context
Load these files for context:
- `src/utils/memberMigrationParser.ts`
- `src/utils/memberMigrationParser.test.ts`
- `src/services/savingsRateService.ts`

## Tasks

<task type="auto">
  <name>Implement computeReverseWajibBreakdown Engine in memberMigrationParser.ts</name>
  <files>
    src/utils/memberMigrationParser.ts
  </files>
  <action>
    1. Buka `src/utils/memberMigrationParser.ts`:
       - Definisikan interface `TierRate`:
         ```typescript
         export interface TierRate {
           startYear: number;
           startMonth: number;
           endYear?: number | null;
           endMonth?: number | null;
           monthlyAmount: number;
         }
         ```
       - Definisikan interface `MonthlyBreakdownItem` dan `ReverseWajibBreakdownResult`:
         ```typescript
         export interface MonthlyBreakdownItem {
           year: number;
           month: number;
           amount: number;
         }

         export interface ReverseWajibBreakdownResult {
           monthlyBreakdown: MonthlyBreakdownItem[];
           monthsCount: number;
           calculatedTotal: number;
           pre2020LumpSum: number;
           excelWajibAmount: number;
           difference: number;
           hasDifference: boolean;
           isPre2020Member: boolean;
         }
         ```
       - Implementasikan fungsi `computeReverseWajibBreakdown`:
         - Parameter:
           - `joinDateStr: string | null | undefined`
           - `excelWajibAmount: number`
           - `tiers: TierRate[]`
           - `currentDate: Date = new Date()`
         - Parsing `joinDate`: gunakan `parseSafeDate` atau pengecekan tanggal valid. Jika tidak ada tanggal atau tidak valid, default fallback.
         - Tentukan batas cutoff pra-bertingkat: `cutoff2020 = new Date(2020, 0, 1)`.
         - Loop mundur dari bulan berjalan (`currYear = currentDate.getFullYear()`, `currMonth = currentDate.getMonth() + 1`):
           - Cek kondisi stop:
             - Jika `currYear < joinYear || (currYear === joinYear && currMonth < joinMonth)` -> break (sudah melewati tgl awal bergabung)
             - Jika `currYear < 2020` -> break (periode pra-2020 tidak diurai per bulan)
           - Temukan tarif berlaku untuk `(currYear, currMonth)`:
             - Target index = `currYear * 12 + currMonth`
             - Cari di `tiers` di mana target index berada di antara `startYear * 12 + startMonth` dan `endYear * 12 + endMonth` (atau 999999 jika null/undefined).
             - Jika tidak ditemukan, default ke tarif standar (misal 200.000 atau tarif tier terdekat).
           - Masukkan ke `monthlyBreakdown` dan tambahkan ke `calculatedTotal`.
           - Geser mundur 1 bulan (`currMonth--`, jika 0 maka `currMonth = 12; currYear--`).
         - Penanganan anggota pra-2020 (`joinDate < cutoff2020`):
           - Saldo sebelum 2020 dicatat utuh: `pre2020LumpSum = Math.max(0, excelWajibAmount - calculatedTotal)`.
           - Anggota pra-2020 tidak dianggap selisih bermasalah (`hasDifference = false` atau selisih 0 karena diserap oleh pra-2020 lump sum, atau bila total excel < calculatedTotal maka terjadi defisit).
         - Evaluasi selisih:
           - Untuk anggota >= Jan 2020: `difference = excelWajibAmount - calculatedTotal`. `hasDifference = Math.abs(difference) > 0`.
           - Untuk anggota < Jan 2020: jika `excelWajibAmount < calculatedTotal`, selisih negatif terdeteksi (`difference = excelWajibAmount - calculatedTotal`, `hasDifference = true`). Jika `excelWajibAmount >= calculatedTotal`, selisih adalah 0 dan sisa tersimpan di `pre2020LumpSum`.
         - Kembalikan objek `ReverseWajibBreakdownResult`.
  </action>
  <verify>
    Fungsi diekspor dengan benar tanpa kesalahan tipe.
  </verify>
  <done>
    Helper engine `computeReverseWajibBreakdown` siap digunakan dan terdefinisi dengan tepat.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for computeReverseWajibBreakdown in memberMigrationParser.test.ts</name>
  <files>
    src/utils/memberMigrationParser.test.ts
  </files>
  <action>
    1. Buka `src/utils/memberMigrationParser.test.ts`:
       - Tambahkan suite pengujian unit untuk `computeReverseWajibBreakdown`:
         - Test 1: Anggota bergabung Nov-2025 s/d Nov-2026 dengan konfigurasi tier multi-periode (misal 2024 s/d Okt 2025 = 150.000, Nov 2025 ke atas = 200.000). Total sesuai -> `hasDifference: false`, `difference: 0`.
         - Test 2: Anggota dengan total Simpanan Wajib di Excel lebih besar atau lebih kecil (terdapat selisih positif/negatif) -> `hasDifference: true`, `difference` sesuai.
         - Test 3: Anggota pra-2020 (misal bergabung 2015-05-10): Uraian per bulan hanya untuk >= Jan 2020, sedangkan sisa saldo dialokasikan utuh ke `pre2020LumpSum`.
         - Test 4: Penanganan edge case (joinDate null/kosong/string invalid, nilai wajib 0, tier kosong).
       - Jalankan test runner: `npx vitest run src/utils/memberMigrationParser.test.ts`.
  </action>
  <verify>
    Semua unit test di `src/utils/memberMigrationParser.test.ts` lulus 100%.
  </verify>
  <done>
    Unit test memvalidasi logika penguraian mundur dan deteksi selisih secara akurat.
  </done>
</task>

## Verification Criteria
- `npx vitest run src/utils/memberMigrationParser.test.ts` passed.
- Logika penguraian mundur berjalan dari bulan sekarang hingga bulan gabung atau Jan 2020.
- Deteksi selisih dan penanganan pra-2020 teruji matematis.

