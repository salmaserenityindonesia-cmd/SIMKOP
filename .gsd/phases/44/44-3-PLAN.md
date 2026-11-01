---
phase: 44
plan: 3
wave: 3
depends_on: ["44.1", "44.2"]
gap_closure: false
---

# Plan 44.3: Unit Testing, Static Verification & Build Check

## Objective
Menulis unit test komprehensif untuk pengujian logika generator jadwal pinjaman migrasi, pengujian sanitasi kolom Excel, pengujian eksekusi database idempotensi (penghapusan pinjaman migrasi lama dan pembentukan jadwal baru), serta memvalidasi kepatuhan tipe TypeScript dan kelulusan build produksi Vite tanpa error.

## Context
- `src/utils/memberMigrationParser.ts`
- `src/utils/memberMigrationParser.test.ts`
- `src/services/memberExcelService.test.ts`

## Tasks

<task type="auto">
  <name>Comprehensive Unit Tests for Migration Loan & Schedules</name>
  <files>
    src/utils/memberMigrationParser.test.ts
    src/services/memberExcelService.test.ts
  </files>
  <action>
    1. Buat unit test suite di `src/utils/memberMigrationParser.test.ts`:
       - Uji skenario pinjaman lunas penuh (`sisa_pinjaman === 0`): semua jadwal harus berstatus `'paid'` dengan `paid_amount === target_amount`.
       - Uji skenario pinjaman belum diangsur (`sisa_pinjaman === jumlah_pinjaman`): semua jadwal harus berstatus `'unpaid'` dengan `paid_amount === 0`.
       - Uji skenario pinjaman angsuran sebagian (misal: pinjaman 12.000.000, tenor 12, sisa 5.000.000):
         * Periode 1 s/d 7 berstatus `'paid'`.
         * Periode 8 s/d 12 berstatus `'unpaid'`.
         * Total unpaid sama dengan 5.000.000.
       - Uji skenario pinjaman dengan sisa tidak habis dibagi cicilan bulanan (terdapat jadwal berstatus `'partial'`).
       - Uji penyesuaian pembulatan pada periode terakhir (`sum(target_amount) === principal`).
       - Uji sanitasi data pinjaman (nilai negatif, string format uang, tenor 0).
    2. Perbarui `src/services/memberExcelService.test.ts`:
       - Uji alur `executeMigration`:
         * Memastikan `bank_account_number` terkirim dalam payload upsert anggota.
         * Memastikan pinjaman migrasi lama dibersihkan (`loan_repayments`, `loan_schedules`, `loans` di-delete).
         * Memastikan record `loans` baru di-insert dengan format `PINJ-MIGRASI-{nrp}` dan status yang sesuai.
         * Memastikan `loan_schedules` dan `loan_repayments` di-insert dengan data amortisasi yang sesuai.
  </action>
  <verify>
    Jalankan `npx vitest run src/utils/memberMigrationParser.test.ts src/services/memberExcelService.test.ts` dan pastikan seluruh test lulus 100%.
  </verify>
  <done>
    Seluruh pengujian unit untuk logika migrasi pinjaman lulus tanpa kegagalan.
  </done>
</task>

<task type="auto">
  <name>Type Checking and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan pemeriksaan tipe statis TypeScript:
       `npx tsc --noEmit`
    2. Jalankan seluruh test suite Vitest untuk memastikan tidak ada regresi pada modul lain:
       `npx vitest run`
    3. Jalankan build produksi Vite:
       `npm run build`
  </action>
  <verify>
    - Vitest exit code 0 dengan seluruh test suite passing.
    - TypeScript compiler exit code 0 tanpa error tipe.
    - Vite build exit code 0 menghasilkan bundle produksi di folder `dist/`.
  </verify>
  <done>
    Kode terverifikasi siap pakai untuk lingkungan produksi.
  </done>
</task>

## Success Criteria
- [ ] Test suite `memberMigrationParser.test.ts` lulus 100% dengan cakupan skenario lunas, baru, partial, dan edge cases
- [ ] Test suite `memberExcelService.test.ts` lulus 100% memvalidasi clean overwrite dan pembuatan jadwal
- [ ] `npx vitest run` seluruh suite lulus 100%
- [ ] `npm run build` menghasilkan exit code 0
