# Plan 61.1 Summary: Data Engine for Loan Repayment Grid & Reconcile

## Objective
Membangun service engine untuk buku bantu angsuran pinjaman interaktif pada `src/services/loanMatrixService.ts` yang mendukung fungsionalitas:
1. `getLoanInteractiveGrid(loanId: string)`: Mengambil ringkasan pinjaman, data jadwal terurut, transaksi pelunasan, sisa pokok hutang, status balans, dan mapping metadata visual grid.
2. `toggleLoanSchedulePaid(scheduleId: string, paid: boolean, payload?: ...)`: Centang/hapus centang pelunasan jadwal pinjaman secara individual dengan pencatatan repayment dan sinkronisasi status pinjaman.
3. `autoReconcileLoanInstallments(loanId: string, totalPaidAvailable: number)`: Alokasi FIFO massal terhadap jadwal angsuran pinjaman dari periode 1 hingga dana habis.
4. `checkAllLoanUpToCurrentMonth(loanId: string)`: Pelunasan massal seluruh jadwal yang jatuh tempo s/d akhir bulan berjalan saat ini.
5. `uncheckAllLoanSchedules(loanId: string)`: Reset massal seluruh pelunasan jadwal pinjaman kembali ke status awal.

Serta menyusun unit tests komprehensif di `src/services/loanMatrixService.test.ts`.

---

## Tasks Completed

### Task 1: Build Loan Schedule Grid Engine in loanMatrixService.ts
- **File**: `src/services/loanMatrixService.ts`
- **Details**:
  - Didefinisikan interface `LoanGridPeriod` dan `LoanInteractiveGridSummary`.
  - Diekspor konstanta `MONTH_NAMES` untuk standardisasi format label periode (mis. "Bulan 1 [Jan-26]").
  - Diimplementasikan `getLoanInteractiveGrid`:
    - Mengambil data pinjaman beserta relasi `member:anggota(id, nama, nrp)`.
    - Mengambil jadwal pinjaman terurut `period_number ASC` dan riwayat `loan_repayments` terurut `payment_date ASC`.
    - Menghitung `totalPaid`, `sisaPinjaman`, `isBalanced`, serta mapping status periode (`PAID`, `PARTIAL`, `UNPAID`, `PROJECTED`) dan deteksi `isCurrentMonth`.
  - Diimplementasikan `toggleLoanSchedulePaid`:
    - Saat `paid = true`: mencatat `loan_repayments`, memperbarui `loan_schedules` (nominal & status), dan otomatis mengubah status pinjaman menjadi `completed` jika semua jadwal telah lunas.
    - Saat `paid = false`: menghapus record pada `loan_repayments`, mereset `loan_schedules` ke `unpaid` / `paid_amount = 0`, dan mengembalikan status pinjaman ke `active`.
  - Diimplementasikan `autoReconcileLoanInstallments`:
    - Menghapus repayments lama dan mengalokasikan saldo secara FIFO dari periode 1.
    - Menangani alokasi penuh dan alokasi parsial pada periode terakhir yang tersisa.
  - Diimplementasikan `checkAllLoanUpToCurrentMonth`:
    - Mencari jadwal dengan `due_date <= endOfCurrentMonth` dan melunasi jadwal yang belum lunas.
  - Diimplementasikan `uncheckAllLoanSchedules`:
    - Menghapus seluruh entri `loan_repayments` pinjaman dan mereset status semua jadwal ke `unpaid`.
- **Verification**: `npx tsc --noEmit` sukses tanpa kesalahan tipe.
- **Commit**: `863bb6fd feat(phase-61): build loan schedule grid engine in loanMatrixService.ts`

### Task 2: Add Unit Tests for Loan Interactive Grid Engine in loanMatrixService.test.ts
- **File**: `src/services/loanMatrixService.test.ts`
- **Details**:
  - Menambahkan test suite untuk `getLoanInteractiveGrid`: kalkulasi sisa saldo, status balans, relasi repayment, dan penentuan status visual periode.
  - Menambahkan test suite untuk `toggleLoanSchedulePaid`: pengujian skenario pelunasan (paid=true) dan pembatalan (paid=false).
  - Menambahkan test suite untuk `autoReconcileLoanInstallments`: pengujian alokasi FIFO (lunas penuh, parsial, nol) serta status akhir pinjaman.
  - Menambahkan test suite untuk `checkAllLoanUpToCurrentMonth`: pengujian pelunasan massal s/d akhir bulan berjalan.
  - Menambahkan test suite untuk `uncheckAllLoanSchedules`: pengujian pembersihan repayments dan reset seluruh jadwal.
- **Verification**: `npx vitest run src/services/loanMatrixService.test.ts` sukses 16/16 test (100% lulus).
- **Commit**: `3849c16d test(phase-61): add unit tests for loan interactive grid engine in loanMatrixService.test.ts`

---

## Verification Evidence
1. **Type Check**:
   - `npx tsc --noEmit`: Exit code 0, 0 errors.
2. **Unit Tests**:
   - `npx vitest run src/services/loanMatrixService.test.ts`:
     ```
     Test Files  1 passed (1)
          Tests  16 passed (16)
       Duration  715ms
     ```

---

## Commits
- `863bb6fd`: `feat(phase-61): build loan schedule grid engine in loanMatrixService.ts`
- `3849c16d`: `test(phase-61): add unit tests for loan interactive grid engine in loanMatrixService.test.ts`

## Deviations
None.
