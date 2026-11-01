---
phase: 44
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 44.1: Data Parsing & Amortization Distribution Logic

## Objective
Membangun modul ekstraksi, sanitasi, dan generator jadwal amortisasi pinjaman migrasi (`src/utils/memberMigrationParser.ts`) yang membaca kolom `bank_account_number`, `jumlah_pinjaman`, `tgl_awal_pinjaman`, `tenor`, dan `sisa_pinjaman`, serta mendistribusikan amortisasi historis secara matematis ke dalam jadwal angsuran (`generateMigrationLoanSchedules`), sehingga nilai sisa pinjaman yang berstatus belum dibayar (`unpaid` / `partial`) tepat setara dengan sisa hutang pada file Excel.

## Context
- `src/services/memberExcelService.ts`
- `src/components/members/MemberMigrationModal.tsx`
- `src/pages/admin/ManajemenAnggota.tsx`

## Tasks

<task type="auto">
  <name>Build Migration Loan Schedule Generator and Sanitizer</name>
  <files>
    src/utils/memberMigrationParser.ts
  </files>
  <action>
    1. Buat file `src/utils/memberMigrationParser.ts` yang mengekspor:
       - Tipe data `MigrationLoanSchedule`:
         ```typescript
         export interface MigrationLoanSchedule {
           period_number: number;
           due_date: string;
           target_amount: number;
           paid_amount: number;
           status: 'paid' | 'partial' | 'unpaid';
         }
         ```
       - Generator jadwal amortisasi `generateMigrationLoanSchedules`:
         ```typescript
         export function generateMigrationLoanSchedules(
           principal: number,
           tenor: number,
           remainingBalance: number,
           startDate: Date | string = new Date()
         ): MigrationLoanSchedule[]
         ```
       - Aturan kalkulasi amortisasi:
         * Jika `principal <= 0` atau `tenor <= 0`, kembalikan array kosong `[]`.
         * Hitung cicilan pokok standar bulanan: `monthlyInstallment = Math.round(principal / tenor)`.
         * Hitung total yang sudah diangsur sebelum migrasi: `alreadyPaid = Math.max(0, principal - remainingBalance)`.
         * Loop periode dari 1 sampai `tenor`:
           - Tentukan target amount periode: untuk periode terakhir, sesuaikan selisih pembulatan agar total `target_amount` seluruh tenor tepat sama dengan `principal` (`target = (i === tenor - 1) ? (principal - (monthlyInstallment * (tenor - 1))) : monthlyInstallment`).
           - Tentukan `due_date`: hitung tanggal jatuh tempo per bulan berturut-turut dari `startDate`. Pastikan penanganan akhir bulan valid (misal `d.setDate(0)` jika bulan melompat). Format YYYY-MM-DD.
           - Alokasikan `alreadyPaid` secara progresif:
             * Jika `alreadyPaid >= target`: status `'paid'`, `paid_amount = target`, kurangi `alreadyPaid -= target`.
             * Jika `alreadyPaid > 0` dan `< target`: status `'partial'`, `paid_amount = alreadyPaid`, set `alreadyPaid = 0`.
             * Jika `alreadyPaid == 0`: status `'unpaid'`, `paid_amount = 0`.
         * Verifikasi matematis: total sisa (`target - paid_amount`) dari seluruh periode berstatus `unpaid` dan `partial` harus bernilai tepat sama dengan `remainingBalance`.
       - Helper sanitasi data pinjaman Excel: `sanitizeMigrationLoanRow(row: any)` untuk memvalidasi angka non-negatif, nomor rekening bank, dan tanggal ISO.
  </action>
  <verify>
    Fungsi `generateMigrationLoanSchedules` menghasilkan tenor berstatus 'paid', 'partial', dan 'unpaid' dengan total sisa persis sama dengan `remainingBalance`.
  </verify>
  <done>
    Generator jadwal pinjaman migrasi dan sanitasi data berhasil dibuat dengan akurasi matematis penuh.
  </done>
</task>

<task type="auto">
  <name>Integrate Loan Parser into Member Excel Service and Modal Preview</name>
  <files>
    src/services/memberExcelService.ts
    src/components/members/MemberMigrationModal.tsx
  </files>
  <action>
    1. Buka `src/services/memberExcelService.ts`:
       - Impor helper dari `src/utils/memberMigrationParser.ts`.
       - Pada `parseMemberUpload`, pastikan pembacaan kolom `bank_account_number`, `jumlah_pinjaman`, `tgl_awal_pinjaman`, `tenor`, dan `sisa_pinjaman` disanitasi menggunakan helper tersebut.
       - Pastikan `sisa_pinjaman` tidak melebihi `jumlah_pinjaman` (jika lebih besar, set batas maksimal sebesar `jumlah_pinjaman`).
    2. Buka `src/components/members/MemberMigrationModal.tsx`:
       - Tampilkan ringkasan pinjaman migrasi pada card summary (Total Nilai Pinjaman, Total Sisa Hutang/Baki Piutang, Anggota dengan Pinjaman Aktif).
       - Pastikan tabel pratinjau menampilkan kolom No Rekening, Pokok Pinjaman, Tenor, dan Sisa Pinjaman dengan format mata uang rupiah yang rapi.
  </action>
  <verify>
    Pratinjau modal migrasi menampilkan data pinjaman dan nomor rekening anggota dengan format yang konsisten dan akurat.
  </verify>
  <done>
    Parsing data pinjaman terhubung mulus dengan modal pratinjau migrasi SIMKOP.
  </done>
</task>

## Success Criteria
- [ ] `generateMigrationLoanSchedules` menghasilkan jadwal amortisasi yang sisa hutangnya tepat sama dengan `remainingBalance`
- [ ] Sanitasi kolom `bank_account_number`, `jumlah_pinjaman`, `tgl_awal_pinjaman`, `tenor`, dan `sisa_pinjaman` bekerja konsisten
- [ ] Modal pratinjau migrasi menampilkan ringkasan data pinjaman dan baki sisa hutang

