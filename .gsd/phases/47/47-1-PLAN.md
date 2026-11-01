---
phase: 47
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 47.1: Dynamic Year Range Resolver Service & Unit Testing

## Objective
Membangun fungsi service query `getSavingsComplianceAvailableYears(): Promise<number[]>` di `src/services/complianceService.ts` yang mengevaluasi tahun paling lampau dari 3 kondisi kewajiban simpanan yang belum tuntas:
1. Anggota aktif yang belum melunasi simpanan pokok (sejak tahun registrasinya).
2. Simpanan hari raya/lebaran yang masih memiliki saldo tersisa (> 0, belum dicairkan penuh).
3. Bulan simpanan wajib yang belum terbayar (menunggak) oleh anggota aktif.
Rentang tahun dibentuk descending dari tahun berjalan (`currentYear`, e.g. 2026) hingga `startYear` tertua yang terdeteksi, dengan fallback `[currentYear]` jika terjadi error atau seluruh kewajiban masa lalu telah terselesaikan. Lengkapi dengan suite unit test komprehensif di `src/services/complianceService.test.ts`.

## Context
- `src/services/complianceService.ts`
- `src/services/matrixService.ts`
- `src/services/loanMatrixService.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Build getSavingsComplianceAvailableYears Service Function</name>
  <files>
    src/services/complianceService.ts
  </files>
  <action>
    1. Buat berkas `src/services/complianceService.ts`.
    2. Implementasikan dan ekspor fungsi `getSavingsComplianceAvailableYears(): Promise<number[]>`:
       - Tentukan `currentYear = new Date().getFullYear()` dan `currentMonth = new Date().getMonth()`.
       - Inisialisasi `candidateYears = [currentYear]`.
       - Ambil daftar `deposit_types` untuk mendeteksi tipe POKOK (kode 'POKOK'/'SP' atau nama mengandung 'pokok'), WAJIB (kode 'WAJIB'/'SW' atau nama mengandung 'wajib'), dan LEBARAN (kode 'LEBARAN'/'SL' atau nama mengandung 'lebaran'/'hari raya').
       - Ambil seluruh anggota dengan `status = 'aktif'` dari tabel `anggota`.
       - Evaluasi Kondisi 1 (Simpanan Pokok Belum Lunas):
         * Ambil transaksi simpanan pokok (`deposit_transactions` untuk `pokokType.id`).
         * Hitung total setoran pokok per anggota. Jika ada anggota aktif yang total setoran pokoknya kurang dari `default_amount` (atau 0), catat tahun registrasi anggota (`new Date(m.created_at).getFullYear()`) ke `candidateYears`.
       - Evaluasi Kondisi 2 (Saldo Simpanan Lebaran Belum Ditarik Habis):
         * Ambil transaksi simpanan lebaran (`deposit_transactions` untuk `lebaranType.id`).
         * Hitung saldo net per anggota (`totalDeposit - totalWithdrawal`).
         * Jika saldo net > 0, ambil tahun transaksi setoran (`for_year` atau tahun dari `created_at`) yang bernilai `<= currentYear` dan masukkan ke `candidateYears`.
       - Evaluasi Kondisi 3 (Tunggakan Bulan Simpanan Wajib):
         * Ambil transaksi simpanan wajib yang disetor (`transaction_type = 'deposit'`).
         * Petakan bulan-bulan yang telah disetor per anggota (`${member_id}_${year}_${month}`).
         * Periksa setiap tahun dari tahun registrasi anggota aktif tertua hingga `currentYear`: jika ada bulan yang belum disetor sejak bulan registrasi anggota hingga bulan berjalan (untuk tahun berjalan) atau bulan Desember (untuk tahun lampau), masukkan tahun tersebut ke `candidateYears`.
       - Hitung `startYear = Math.min(...candidateYears)`.
       - Bentuk array descending dari `currentYear` turun ke `startYear`:
         ```typescript
         const years: number[] = [];
         for (let y = currentYear; y >= startYear; y--) {
           years.push(y);
         }
         return years.length > 0 ? years : [currentYear];
         ```
       - Bungkus seluruh operasi dalam blok `try...catch` dengan fallback mengembalikan `[currentYear]` jika terjadi kesalahan kueri/jaringan.
  </action>
  <verify>
    Fungsi `getSavingsComplianceAvailableYears` diekspor dari `src/services/complianceService.ts` dan mengembalikan rentang tahun descending secara tepat.
  </verify>
  <done>
    Fungsi `getSavingsComplianceAvailableYears` selesai diimplementasikan di `src/services/complianceService.ts`.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for getSavingsComplianceAvailableYears</name>
  <files>
    src/services/complianceService.test.ts
  </files>
  <action>
    1. Buat berkas `src/services/complianceService.test.ts` menggunakan Vitest.
    2. Mock Supabase client dari `../lib/supabaseClient`.
    3. Susun skenario pengujian komprehensif:
       - Kasus 1: Seluruh kewajiban lunas & simpanan lebaran bersaldo 0 -> mengembalikan `[currentYear]`.
       - Kasus 2: Ada anggota aktif yang belum melunasi simpanan pokok sejak pendaftaran tahun 2023 -> mengembalikan `[2026, 2025, 2024, 2023]`.
       - Kasus 3: Simpanan lebaran tahun 2024 masih memiliki sisa saldo (belum ditarik habis) -> mengembalikan `[2026, 2025, 2024]`.
       - Kasus 4: Ada tunggakan simpanan wajib tahun 2025 oleh anggota aktif -> mengembalikan `[2026, 2025]`.
       - Kasus 5: Semua kewajiban tahun lampau selesai dan simpanan lebaran dicairkan tuntas -> batas awal bergeser maju ke tahun berjalan `[2026]`.
       - Kasus 6: Graceful fallback mengembalikan `[currentYear]` saat terjadi error jaringan/kueri database.
    4. Jalankan pengujian: `npx vitest run src/services/complianceService.test.ts`.
  </action>
  <verify>
    `npx vitest run src/services/complianceService.test.ts` berhasil lulus 100%.
  </verify>
  <done>
    Rangkaian unit test untuk `complianceService.ts` terverifikasi menyeluruh dengan mock Supabase.
  </done>
</task>

## Success Criteria
- [ ] `getSavingsComplianceAvailableYears()` mengevaluasi 3 kondisi: simpanan pokok belum lunas, saldo simpanan lebaran menggantung, dan tunggakan simpanan wajib
- [ ] Menghasilkan array tahun descending dari `currentYear` hingga `startYear` tertua yang memiliki kewajiban
- [ ] Batas awal tahun otomatis bergeser maju saat kewajiban tahun lampau telah terselesaikan
- [ ] Rangkaian unit test Vitest lulus 100% mencakup seluruh skenario bisnis dan penanganan error
