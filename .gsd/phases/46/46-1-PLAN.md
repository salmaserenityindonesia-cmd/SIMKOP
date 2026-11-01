---
phase: 46
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 46.1: Dynamic Year Range Resolver Service & Unit Testing

## Objective
Membangun fungsi query pembantu `getLoanMatrixAvailableYears()` di `src/services/loanMatrixService.ts` yang mendeteksi batas bawah tahun berdasarkan pinjaman aktif/belum lunas tertua (status `active` atau `approved`) dan batas atas berdasarkan jadwal jatuh tempo pinjaman terjauh (`loan_schedules.due_date`), serta menyusun rangkaian unit test untuk menguji resolusi rentang tahun secara komprehensif.

## Context
- `src/services/loanMatrixService.ts`
- `src/services/loanService.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Build getLoanMatrixAvailableYears in loanMatrixService.ts</name>
  <files>
    src/services/loanMatrixService.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`.
    2. Tambahkan dan ekspor fungsi async `getLoanMatrixAvailableYears(): Promise<number[]>`:
       - Tentukan `currentYear = new Date().getFullYear()`.
       - Ambil pinjaman aktif/approved tertua dari Supabase `loans`:
         ```typescript
         const { data: oldestActiveLoan, error: oldestError } = await supabase
           .from('loans')
           .select('disbursed_at, created_at')
           .in('status', ['active', 'approved'])
           .order('disbursed_at', { ascending: true, nullsFirst: false })
           .limit(1)
           .maybeSingle();
         ```
       - Jika `oldestActiveLoan` ditemukan, ambil tanggal dari `oldestActiveLoan.disbursed_at || oldestActiveLoan.created_at`.
       - Parse tahun (`new Date(loanDateStr).getFullYear()`). Jika valid dan `<= currentYear`, jadikan sebagai `startYear`. Jika tidak ada pinjaman aktif/belum lunas, default `startYear = currentYear`.
       - Ambil jadwal jatuh tempo terjauh dari Supabase `loan_schedules`:
         ```typescript
         const { data: latestSchedule, error: scheduleError } = await supabase
           .from('loan_schedules')
           .select('due_date')
           .order('due_date', { ascending: false })
           .limit(1)
           .maybeSingle();
         ```
       - Jika `latestSchedule?.due_date` ditemukan, parse tahun (`new Date(latestSchedule.due_date).getFullYear()`). Jika valid dan `> currentYear`, set `endYear = scheduleYear`. Default `endYear = currentYear`.
       - Bentuk array descending dari `endYear` turun ke `startYear`:
         ```typescript
         const years: number[] = [];
         for (let y = endYear; y >= startYear; y--) {
           years.push(y);
         }
         return years.length > 0 ? years : [currentYear];
         ```
       - Bungkus dalam try-catch dengan fallback return `[currentYear]` jika terjadi kesalahan jaringan/kueri.
  </action>
  <verify>
    Fungsi `getLoanMatrixAvailableYears` diekspor dan menghasilkan array angka tahun terurut mengecil (descending).
  </verify>
  <done>
    Helper service dinamis `getLoanMatrixAvailableYears` selesai diimplementasikan di `src/services/loanMatrixService.ts`.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for getLoanMatrixAvailableYears</name>
  <files>
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buat berkas `src/services/loanMatrixService.test.ts` menggunakan Vitest.
    2. Mock `supabase` client dari `../lib/supabaseClient`:
       - Mock respons `from('loans').select(...).in(...).order(...).limit(...).maybeSingle()`
       - Mock respons `from('loan_schedules').select(...).order(...).limit(...).maybeSingle()`
    3. Buat skenario pengujian:
       - Kasus 1: Tidak ada pinjaman aktif -> mengembalikan `[currentYear]`.
       - Kasus 2: Pinjaman aktif tertua tanggal `2023-05-10`, jadwal terjauh `2026-12-01` (tahun aktif 2026) -> mengembalikan `[2026, 2025, 2024, 2023]`.
       - Kasus 3: Pinjaman aktif tertua tanggal `2024-01-15`, jadwal jatuh tempo terjauh hingga `2028-10-01` -> mengembalikan `[2028, 2027, 2026, 2025, 2024]`.
       - Kasus 4: `disbursed_at` null, fallback ke `created_at` (`2022-08-01`) -> tahun mulai 2022.
       - Kasus 5: Error query supabase -> graceful fallback mengembalikan `[currentYear]`.
    4. Jalankan pengujian dengan `npx vitest run src/services/loanMatrixService.test.ts`.
  </action>
  <verify>
    `npx vitest run src/services/loanMatrixService.test.ts` berhasil lulus 100%.
  </verify>
  <done>
    Unit test untuk `getLoanMatrixAvailableYears` terverifikasi menyeluruh dengan mock Supabase.
  </done>
</task>

## Success Criteria
- [ ] `getLoanMatrixAvailableYears()` mengembalikan rentang tahun dinamis dari pinjaman belum lunas tertua hingga jadwal terjauh
- [ ] Fallback yang aman (`[currentYear]`) ketika tidak ada pinjaman aktif atau terjadi error query
- [ ] Suite unit test Vitest mencakup semua skenario (tanpa pinjaman aktif, jadwal multi-tahun masa depan, fallback created_at, error network)
