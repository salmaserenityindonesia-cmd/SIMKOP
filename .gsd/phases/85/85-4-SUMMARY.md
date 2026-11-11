# Plan 85.4 Summary: Protect Matrix Ledger from Leaking Old Balances

## Objective
Menyelaraskan kalkulasi matriks simpanan di `src/services/savingsMatrixService.ts` agar membaca tanggal cut-off dari siklus pencairan massal simpanan lebaran terakhir (`getLastCompletedLebaranCycle`). Bulan-bulan sebelum atau pada tanggal cut-off ditandai sebagai periode yang telah tuntas/dicairkan (*settled/closed*), dan setoran rutin siklus baru dimulai murni dari Rp 0 tanpa pernah menarik kembali mutasi sebelum tanggal pencairan.

## Tasks Completed
1. **Align savingsMatrixService with Last Lebaran Cycle Cut-off**
   - **File modified:** `src/services/savingsMatrixService.ts`, `src/services/bulkWithdrawalService.ts`
   - **Test file created:** `src/services/savingsMatrixService.lebaran.test.ts`
   - **Commit:** `abd7a56c` (`feat(phase-85): align savingsMatrixService with last lebaran cycle cut-off`)
   - **Implementasi:**
     - Ditambahkan helper `isMonthSettledByCutOff(year, month, cutOffDate)` untuk memeriksa apakah periode berada pada atau sebelum tanggal cut-off pencairan secara aman bebas offset timezone.
     - Ditambahkan helper `getLastCompletedLebaranCutOff()` dan integrasi `getLastCompletedLebaranCycle()` dari `bulkWithdrawalService`.
     - Parameter opsional `cutOffDate` ditambahkan ke `calculateFifoAllocation` dan `matchAutomaticFifo` dengan backward compatibility penuh.
     - Pada `reconcileSingleMemberDeposit`:
       - Untuk simpanan `LEBARAN`, saldo berjalan (`runningBalance`) dihitung dengan memperhitungkan seluruh mutasi `transaction_type === 'withdrawal'`, sehingga saldo pasca-pencairan massal bernilai Rp 0.
       - Jika terdapat mutasi penarikan massal atau siklus berstatus `COMPLETED`, cut-off date digunakan untuk mengunci bulan-bulan settled.
       - Seluruh mutasi historis masa lalu pada periode settled dilindungi dari penghapusan atau purge blanket.
       - Setoran rutin siklus baru dialokasikan murni dari Rp 0 mulai dari bulan pertama setelah cut-off date.
     - Pada `bulkAutoReconcileAllMembers` dan `bulkCheckAllUpToCurrentMonth`:
       - `getLastCompletedLebaranCycle` di-query sekali di awal sebagai cache efisien sebelum iterasi loop anggota.

## Verification Evidence
1. **Unit Test Spesifik Siklus Lebaran:**
   - Command: `npx vitest run src/services/savingsMatrixService.lebaran.test.ts`
   - Result: 9 passed (100%).
   - Skenario pengujian:
     - Anggota memiliki saldo Rp 1.200.000 kemudian dilakukan pencairan massal Rp 1.200.000 -> saldo riil terbukti Rp 0 dan matchedKeys kosong.
     - Setoran baru Rp 100.000 pada April 2025 (pasca cut-off 2025-03-31) dialokasikan murni dari Rp 0 ke slot `2025-04` tanpa distorsi histori 2024.
     - Mutasi historis lama tidak terhapus.
     - Cache query cut-off pada `bulkAutoReconcileAllMembers` tervalidasi hanya memanggil query siklus 1x.
2. **Pengujian Seluruh Matriks Simpanan:**
   - Command: `npx vitest run src/services/savingsMatrixService`
   - Result: 46 passed across 2 test files (100%).
3. **Pengujian Integrasi Bulk Withdrawal & Compliance:**
   - Command: `npx vitest run src/services/bulkWithdrawalService.test.ts` -> 12 passed.
   - Command: `npx vitest run src/services/complianceService.test.ts` -> 41 passed.
4. **Production Build Compilation:**
   - Command: `npm run build`
   - Result: Built in 1.16s with 0 errors.

## Deviations & In-Scope Adjustments
- `src/services/bulkWithdrawalService.ts`: Ditambahkan pengecekan keberadaan method `.eq` pada builder kueri Supabase di `getLastCompletedLebaranCycle` untuk mencegah unmocked query warning pada unit test runner.
