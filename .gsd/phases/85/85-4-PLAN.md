---
phase: 85
plan: 4
wave: 4
gap_closure: false
---

# Plan 85.4: Protect Matrix Ledger from Leaking Old Balances

## Objective
Menyelaraskan kalkulasi matriks simpanan di `src/services/savingsMatrixService.ts` agar membaca tanggal cut-off dari siklus pencairan massal simpanan lebaran terakhir (`getLastCompletedLebaranCycle`). Bulan-bulan sebelum atau pada tanggal cut-off ditandai sebagai periode yang telah tuntas/dicairkan (*settled/closed*), dan setoran rutin siklus baru dimulai murni dari Rp 0 tanpa pernah menarik kembali mutasi sebelum tanggal pencairan.

## Context
Load these files for context:
- src/services/savingsMatrixService.ts
- src/services/savingsMatrixService.test.ts
- src/services/bulkWithdrawalService.ts

## Tasks

<task type="auto">
  <name>Align savingsMatrixService with Last Lebaran Cycle Cut-off</name>
  <files>src/services/savingsMatrixService.ts, src/services/savingsMatrixService.test.ts</files>
  <action>
    - Buka `src/services/savingsMatrixService.ts`:
      1. Integrasikan pengambilan siklus pencairan massal terakhir:
         - Sediakan helper internal atau panggil `getLastCompletedLebaranCycle()`:
           * Ambil `cut_off_date` siklus lebaran terakhir yang berstatus 'COMPLETED'.
      2. Pada logika rekonsiliasi dan alokasi simpanan (`reconcileSingleMemberDeposit` / `calculateFifoAllocation`):
         - Jika tipe simpanan yang diproses adalah 'LEBARAN':
           * Cek apakah ada `cut_off_date` pencairan massal terakhir.
           * Periksa mutasi penarikan massal yang tercatat di `deposit_transactions` (memiliki deskripsi atau catatan pencairan lebaran).
           * Saldo berjalan (running balance) simpanan lebaran harus secara eksplisit memperhitungkan seluruh transaksi penarikan (`transaction_type === 'withdrawal'`), sehingga saldo setelah pencairan tepat bernilai Rp 0.
           * Untuk rentang bulan matriks pada siklus simpanan lebaran: bulan-bulan sebelum cut-off date dianggap telah terkunci (*settled*). Pengecekan atau centang alokasi simpanan bulanan baru hanya berlaku untuk bulan-bulan setelah tanggal pencairan terakhir.
      3. Pastikan proses `bulkAutoReconcileAllMembers` tetap berjalan efisien dengan memanfaatkan cache `cut_off_date` sekali query di awal agar tidak membebani database per iterasi anggota.
    - Perbarui unit test di `src/services/savingsMatrixService.test.ts` (atau buat file test spesifik `src/services/savingsMatrixService.lebaran.test.ts`):
      * Uji skenario anggota yang memiliki saldo Rp 1.200.000 kemudian dilakukan pencairan massal Rp 1.200.000.
      * Pastikan saldo riil setelah pencairan adalah Rp 0.
      * Pastikan setoran baru pada bulan berikutnya mengalokasikan saldo dimulai murni dari Rp 0 tanpa terdistorsi oleh histori masa lalu.
  </action>
  <verify>
    Jalankan test: `npx vitest run src/services/savingsMatrixService` dan pastikan seluruh pengujian matriks simpanan berhasil.
  </verify>
  <done>
    Integritas buku besar simpanan lebaran aman, saldo setelah pencairan terbukti Rp 0, dan siklus baru dimulai murni dari 0.
  </done>
</task>

## Must-Haves
- [ ] Pengambilan `cut_off_date` siklus lebaran terakhir diintegrasikan ke `savingsMatrixService`.
- [ ] Mutasi penarikan massal memotong saldo simpanan lebaran hingga menjadi Rp 0.
- [ ] Siklus baru simpanan lebaran tidak bocor oleh setoran sebelum tanggal cut-off pencairan.
- [ ] Unit testing memvalidasi pencegahan kebocoran saldo lampau.

## Success Criteria
- [ ] Seluruh test simpanan matriks lulus 100%.
- [ ] Tidak terjadi regresi pada alokasi Simpanan Wajib maupun Simpanan Belanja.

