---
phase: 85
plan: 2
wave: 2
gap_closure: false
---

# Plan 85.2: Service Layer for Bulk Simulation, Draft, and Execution

## Objective
Membangun service layer `src/services/bulkWithdrawalService.ts` yang menyediakan fungsionalitas komprehensif untuk simulasi pencairan simpanan lebaran (daftar nominatif, total dana, cek pinjaman aktif), pembuatan draf siklus, eksekusi/approval via PostgreSQL RPC (beserta client-side fallback yang tangguh), pembatalan/penolakan draf, serta pembacaan histori siklus pencairan terakhir.

## Context
Load these files for context:
- src/services/withdrawal.service.ts
- src/services/savingsMatrixService.ts
- supabase/migrations/046_create_lebaran_disbursement_cycles.sql

## Tasks

<task type="auto">
  <name>Build bulkWithdrawalService with Simulation, Draft, and Execution</name>
  <files>src/services/bulkWithdrawalService.ts, src/services/bulkWithdrawalService.test.ts</files>
  <action>
    - Buat berkas `src/services/bulkWithdrawalService.ts`:
      1. Tipe data:
         * `LebaranDisbursementCycle`: status ('DRAFT' | 'APPROVED' | 'COMPLETED' | 'REJECTED'), cut_off_date, total_members, total_amount, dll.
         * `LebaranSimulationMember`: memberId, nrp, nama, pangkat, bankAccount, bankName, saldoLebaran, hasActiveLoan, activeLoanRemaining.
         * `LebaranSimulationSummary`: totalMembers, totalAmount, averageAmount, members: LebaranSimulationMember[].
      2. `simulateLebaranDisbursement()`:
         * Ambil master deposit type untuk kategori 'LEBARAN' (code 'LEBARAN' atau 'SL' atau name memuat 'lebaran' / 'hari raya').
         * Query seluruh `member_deposits` terkait bersama anggota berstatus 'aktif'.
         * Query seluruh `deposit_transactions` untuk menghitung saldo berjalan masing-masing anggota.
         * Filter hanya anggota yang memiliki saldo > 0.
         * Lakukan cross-lookup ke tabel pinjaman (`loans` / `loan_applications`) untuk mendeteksi anggota yang memiliki pinjaman aktif / belum lunas sebagai informasi mitigasi pengawasan.
         * Kembalikan ringkasan simulasi: `totalMembers`, `totalAmount`, `averageAmount`, dan array nominatif anggota.
      3. `createDisbursementDraft(payload: { cycleName: string; cutOffDate: string; notes?: string; createdBy?: string })`:
         * Jalankan simulasi terlebih dahulu untuk memastikan data total terkini.
         * Insert record baru ke `lebaran_disbursement_cycles` dengan status 'DRAFT'.
         * Kembalikan data siklus baru.
      4. `approveAndExecuteDisbursement(cycleId: string, approverId?: string)`:
         * Coba panggil RPC `execute_bulk_lebaran_disbursement(cycleId, approverId)`.
         * Jika RPC belum terpasang atau mengembalikan error fallback, jalankan eksekusi pencairan terstruktur dari sisi klien (ambil data simulasi, buat mutasi `deposit_transactions` untuk tiap anggota, lalu update status siklus menjadi 'COMPLETED').
      5. `rejectDisbursementDraft(cycleId: string, notes?: string)`:
         * Update status siklus menjadi 'REJECTED'.
      6. `getLebaranDisbursementCycles()`:
         * Ambil seluruh riwayat siklus dari `lebaran_disbursement_cycles` diurutkan dari yang terbaru (`created_at DESC`).
      7. `getLastCompletedLebaranCycle()`:
         * Ambil 1 record siklus terakhir yang berstatus 'COMPLETED' untuk mendapatkan referensi `cut_off_date`.
    - Buat unit test komprehensif di `src/services/bulkWithdrawalService.test.ts`:
      * Mocking supabase client.
      * Uji fungsi simulasi saldo simpanan lebaran dan kalkulasi metrik.
      * Uji pembuatan draf siklus pencairan.
      * Uji alur approval & eksekusi sukses.
      * Uji pembacaan siklus terakhir.
  </action>
  <verify>
    Jalankan test: `npx vitest run src/services/bulkWithdrawalService.test.ts` dan pastikan seluruh test kasus berhasil 100%.
  </verify>
  <done>
    Service layer `bulkWithdrawalService` selesai dibuat dan terverifikasi penuh dengan unit tests.
  </done>
</task>

## Must-Haves
- [ ] Fungsi simulasi `simulateLebaranDisbursement` mendeteksi anggota dengan saldo lebaran > 0 dan mengecek status pinjaman aktif.
- [ ] Penanganan pembuatan draf siklus dan eksekusi atomik melalui RPC `execute_bulk_lebaran_disbursement`.
- [ ] Fallback graceful jika RPC belum diaplikasikan di server live.
- [ ] Unit tests di `bulkWithdrawalService.test.ts` mencakup simulasi, draft, eksekusi, dan riwayat siklus.

## Success Criteria
- [ ] Semua unit test pada `bulkWithdrawalService.test.ts` lulus tanpa error.
- [ ] Layanan siap dikonsumsi oleh antarmuka pengguna di Wave 3.

