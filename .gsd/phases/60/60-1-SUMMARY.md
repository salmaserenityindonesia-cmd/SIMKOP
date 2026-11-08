# Summary Plan 60.1: Align Monthly Cell Data Contract in loanMatrixService.ts

## Objective
Memperkaya tipe data dan struktur kembalian sel bulanan pinjaman pada `src/services/loanMatrixService.ts` dengan menyertakan `year`, `dueDate`, dan type alias `MonthLoanCell` yang kompatibel dengan status angsuran pinjaman, serta memvalidasi kesesuaian unit testing pada layer service.

## Executed Tasks
1. **Enrich LoanMatrixMonth and Export MonthLoanCell Interface**
   - File: `src/services/loanMatrixService.ts`
   - Menambahkan properti opsional `year?: number` dan `dueDate?: string` pada antarmuka `LoanMatrixMonth`.
   - Memperluas tipe union `status` agar mendukung lowercase dan uppercase status.
   - Mengekspor alias tipe data `MonthLoanCell = LoanMatrixMonth`.
   - Menginisialisasi default 12 bulan dengan `year: year` dan mengisi `year: scheduleYear` serta `dueDate: sched.due_date` saat memproses jadwal pinjaman.
   - Commit: `b2ee1a0a` (`feat(phase-60): Enrich LoanMatrixMonth and Export MonthLoanCell Interface`)

2. **Add Unit Tests for MonthLoanCell Data Contract in loanMatrixService.test.ts**
   - File: `src/services/loanMatrixService.test.ts`
   - Menambahkan test suite baru `loanMatrixService - getLoanMatrix & MonthLoanCell Data Contract`:
     - Pengujian contract type alias `MonthLoanCell` dengan berbagai status dan properti `year`/`dueDate`.
     - Pengujian fallback `getLoanMatrix` saat data pinjaman kosong untuk tahun terkait.
     - Pengujian populasi data jadwal `year`, `dueDate`, `month`, `status`, `targetAmount`, dan `paidAmount` pada sel bulanan.
   - Commit: `797bd966` (`feat(phase-60): Add Unit Tests for MonthLoanCell Data Contract in loanMatrixService.test.ts`)

## Verification Results
- `npx tsc --noEmit`: Lulus tanpa error tipe.
- `npx vitest run src/services/loanMatrixService.test.ts`: 8 tests passed (100%).
- `npx vitest run src/services/loanMatrixService.test.ts src/pages/admin/LoanMatrix.test.tsx`: 17 tests passed (100%).

## Deviations
None.

## Commits
- `b2ee1a0a`
- `797bd966`
