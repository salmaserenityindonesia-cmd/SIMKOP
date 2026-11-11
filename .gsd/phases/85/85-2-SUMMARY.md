# Plan 85.2 Summary: Service Layer for Bulk Simulation, Draft, and Execution

## Overview
Membangun service layer komprehensif `src/services/bulkWithdrawalService.ts` untuk mendukung fitur pencairan massal simpanan lebaran anggota aktif Primkopau. Modul ini menyediakan simulasi daftar nominatif anggota berhak beserta saldo riil, pemeriksaan mitigasi pinjaman aktif, pembuatan draf siklus pencairan, eksekusi atomik via RPC PostgreSQL `execute_bulk_lebaran_disbursement` (dengan client-side fallback terstruktur), penolakan/pembatalan draf, dan riwayat siklus pencairan.

## Key Changes
1. **`src/services/bulkWithdrawalService.ts`**:
   - **Tipe Data**:
     - `LebaranDisbursementCycle`: Representasi record siklus pencairan (`id`, `cycle_name`, `cut_off_date`, `total_members`, `total_amount`, `status`, `notes`, `created_by`, `approved_by`, `approved_at`, dll).
     - `LebaranSimulationMember`: Nominatif anggota (`memberId`, `memberDepositId`, `nrp`, `nama`, `pangkat`, `bankAccount`, `bankName`, `saldoLebaran`, `hasActiveLoan`, `activeLoanRemaining`).
     - `LebaranSimulationSummary`: Ringkasan metrik (`totalMembers`, `totalAmount`, `averageAmount`, `members`).
   - **`isLebaranDepositType(code, name)`**: Deteksi akurat kode (`LEBARAN`, `SL`, `THR`) dan nama jenis simpanan lebaran/hari raya.
   - **`simulateLebaranDisbursement()`**:
     - Mencari `deposit_types` untuk simpanan lebaran.
     - Memfilter anggota aktif (`anggota.status = 'aktif'`).
     - Menghitung saldo berjalan per anggota dari `deposit_transactions` (deposit dikurangi withdrawal).
     - Memfilter hanya anggota dengan saldo > 0.
     - Melakukan cross-lookup ke tabel `loans` (status `active` / `approved`) untuk menghitung sisa pinjaman aktif sebagai parameter mitigasi pengawasan.
     - Mengembalikan ringkasan total anggota, total dana, rata-rata nominal, dan nominatif terurut alfabetis.
   - **`createDisbursementDraft(payload)`**:
     - Menjalankan simulasi terlebih dahulu untuk memastikan data total terkini.
     - Menyimpan draf baru ke `lebaran_disbursement_cycles` dengan status `'DRAFT'`.
   - **`approveAndExecuteDisbursement(cycleId, approverId)`**:
     - Memanggil PostgreSQL RPC atomik `execute_bulk_lebaran_disbursement`.
     - Menyediakan fallback eksekusi dari sisi klien jika RPC belum terpasang: mencatat mutasi withdrawal per anggota ke `deposit_transactions` dengan referensi `KW-THR-[YEAR]-[NRP]`, menyisipkan arus kas keluar ke `cash_flow`, dan mengupdate status siklus menjadi `'COMPLETED'`.
   - **`rejectDisbursementDraft(cycleId, notes)`**:
     - Mengupdate status siklus menjadi `'REJECTED'` disertai catatan penolakan.
   - **`getLebaranDisbursementCycles()` & `getLastCompletedLebaranCycle()`**:
     - Memuat seluruh riwayat siklus terurut `created_at DESC` dan siklus terakhir yang selesai (`COMPLETED`).

2. **`src/services/bulkWithdrawalService.test.ts`**:
   - 12 test cases lengkap mencakup:
     - Deteksi jenis simpanan lebaran (`isLebaranDepositType`).
     - Kalkulasi simulasi, saldo berjalan, filter non-aktif, filter saldo nol, dan deteksi pinjaman aktif.
     - Pembuatan draf siklus dan validasi input.
     - Eksekusi via RPC PostgreSQL mode `rpc`.
     - Eksekusi via client fallback mode `client_fallback` saat RPC gagal/tidak tersedia.
     - Proteksi penolakan eksekusi siklus berstatus non-DRAFT.
     - Penolakan draf siklus (`REJECTED`).
     - Pengambilan riwayat dan siklus terakhir yang selesai.

## Verification
- `npx vitest run src/services/bulkWithdrawalService.test.ts`: **12 passed (100%)**
- `npx vitest run src/services/savingsWithdrawalService.test.ts src/services/withdrawalReportService.test.ts`: **21 passed (100%)**
- `npx tsc --noEmit`: **Pass without errors (exit code 0)**

## Commits
- `5507b9a4`: `feat(phase-85): build bulkWithdrawalService with simulation, draft, and execution`

## Deviations
None.

## Deferred
None.
