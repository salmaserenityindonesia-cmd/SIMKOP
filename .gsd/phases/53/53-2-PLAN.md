---
phase: 53
plan: 2
wave: 2
depends_on:
  - 53.1
gap_closure: false
---

# Plan 53.2: Excel Importer & Ledger Mutation Processor

## Objective
Membangun engine parser cerdas `src/utils/savingsMatrixImporter.ts` untuk membaca berkas Excel hasil audit admin dan mengekstrak mutasi bulanan per anggota, serta mengimplementasikan fungsi `importSavingsMatrixLedger` di `src/services/complianceService.ts` untuk membersihkan mutasi rekonsiliasi lama dan melakukan batch insertion transaksi ke `deposit_transactions` dengan pembagian chunking aman.

## Context
- `src/utils/savingsMatrixImporter.ts`
- `src/utils/savingsMatrixImporter.test.ts`
- `src/services/complianceService.ts`
- `src/services/complianceService.test.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Build Savings Matrix Excel Parser</name>
  <files>
    src/utils/savingsMatrixImporter.ts
    src/utils/savingsMatrixImporter.test.ts
  </files>
  <action>
    1. Buat berkas `src/utils/savingsMatrixImporter.ts`.
    2. Definisikan interface hasil parsing:
       ```typescript
       export interface ParsedMonthlyDeposit {
         nrp: string;
         year: number;
         month: number;
         amount: number;
       }

       export interface ParseSavingsMatrixResult {
         success: boolean;
         totalRows: number;
         totalMutations: number;
         mutations: ParsedMonthlyDeposit[];
         errors: string[];
         detectedMonths: Array<{ colIndex: number; year: number; month: number; label: string }>;
       }
       ```
    3. Implementasikan fungsi `parseSavingsMatrixExcel(file: File | ArrayBuffer)`:
       - Membaca file / buffer menggunakan `ExcelJS.Workbook`.
       - Ambil worksheet pertama.
       - Identifikasi baris header (baris 1):
         * Cari kolom `nrp` (case-insensitive).
         * Temukan batas awal kolom bulan (kolom setelah `saldo acuan` atau kolom ke-5).
         * Temukan batas akhir kolom bulan (kolom sebelum `total alokasi` atau kolom `selisih`).
         * Ekstrak informasi bulan (1-12) dan tahun (misal 2021-2026) dari teks header kolom menggunakan regex fleksibel yang mendukung format `Mei-21`, `May-21`, `May 2021`, `05/21`, atau objek `Date`.
       - Iterasi setiap baris data (baris 2 dst):
         * Ekstrak nilai `nrp` (string non-empty).
         * Jika `nrp` kosong, lewati baris.
         * Untuk setiap kolom bulan yang terdeteksi:
           - Baca nilai sel (tangani format angka murni, format accounting string, atau object formula result `{ result: number }`).
           - Jika nominal numeric `> 0`, tambahkan ke daftar `mutations`.
       - Kembalikan rekapitulasi `ParseSavingsMatrixResult`.
    4. Buat unit tests di `src/utils/savingsMatrixImporter.test.ts` untuk memvalidasi:
       - Parsing berkas valid dengan berbagai nama format header bulan (Indonesia/Inggris).
       - Penanganan sel kosong, bernilai 0, atau formula result.
       - Penanganan baris kosong atau NRP tidak valid.
  </action>
  <verify>
    npx vitest run src/utils/savingsMatrixImporter.test.ts
  </verify>
  <done>
    Parser file Excel matriks simpanan selesai dibuat dan terverifikasi dengan unit tests.
  </done>
</task>

<task type="auto">
  <name>Build Ledger Mutation Sync in complianceService.ts</name>
  <files>
    src/services/complianceService.ts
    src/services/complianceService.test.ts
  </files>
  <action>
    1. Buka `src/services/complianceService.ts`.
    2. Tambahkan interface `ImportSavingsMatrixLedgerResult`:
       ```typescript
       export interface ImportSavingsMatrixLedgerResult {
         success: boolean;
         totalMembers: number;
         totalTransactions: number;
         errors?: string[];
       }
       ```
    3. Implementasikan fungsi `importSavingsMatrixLedger(depositTypeCode: 'WAJIB' | 'BELANJA' | 'LEBARAN', mutations: ParsedMonthlyDeposit[])`:
       - Dapatkan data `deposit_types` untuk menentukan ID tipe simpanan target.
       - Dapatkan data `anggota` aktif untuk memetakan `nrp` -> `member_id`.
       - Ambil atau buat akun `member_deposits` untuk seluruh anggota yang memiliki mutasi jika belum ada.
       - Hapus mutasi lama berlabel `'Rekonsiliasi Otomatis'` atau `'Import Matriks Buku Besar Excel'` untuk jenis simpanan tersebut pada anggota-anggota terkait guna menghindari akumulasi ganda (double-counting).
       - Hapus transaksi saldo awal migrasi lump-sum (`for_month IS NULL` atau bertanda saldo awal/migrasi) yang sudah dipecah ke mutasi bulanan ini.
       - Siapkan daftar record baru untuk tabel `deposit_transactions`:
         `{ member_deposit_id, transaction_type: 'deposit', amount, for_month, for_year, description: 'Import Matriks Buku Besar Excel' }`.
       - Lakukan batch insert massal secara bertahap (chunking per 100 baris) ke Supabase.
       - Kembalikan ringkasan `{ success: true, totalMembers, totalTransactions }`.
    4. Tambahkan test suite di `src/services/complianceService.test.ts` untuk memverifikasi proses impor mutasi buku besar simpanan, pembersihan transaksi lama, dan penanganan chunking.
  </action>
  <verify>
    npx vitest run src/services/complianceService.test.ts
  </verify>
  <done>
    Fungsi sinkronisasi mutasi buku besar simpanan selesai dan teruji secara menyeluruh.
  </done>
</task>

## Success Criteria
- [ ] Parser `src/utils/savingsMatrixImporter.ts` berhasil membaca data mutasi bulanan dari lembar kerja Excel.
- [ ] Fungsi `importSavingsMatrixLedger` di `src/services/complianceService.ts` berhasil menyinkronkan transaksi ke database tanpa duplikasi data.
- [ ] Pengujian unit di `src/utils/savingsMatrixImporter.test.ts` dan `src/services/complianceService.test.ts` lulus 100%.
