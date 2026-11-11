# Plan 91.1 Summary: Calculate Prior-Year Repayments in loanMatrixService.ts

## Metadata
- **Phase**: 91
- **Plan**: 1
- **Wave**: 1
- **Status**: Completed
- **Commit**: `44b5ca6a`

## Tasks Completed

| Task | Name | Files | Commit |
|---|---|---|---|
| 1 | Aggregate Prior-Year Repayments per Loan in Service Layer | `src/services/loanMatrixService.ts`, `src/services/loanMatrixService.test.ts` | `44b5ca6a` |

## Key Changes
1. **Interface Extension (`LoanMatrixMember` / `LoanMatrixRow`)**:
   - Menambahkan field opsional `priorYearPaid?: number;` dan `priorYearRemaining?: number;` pada interface `LoanMatrixMember`.
2. **Prior-Year Repayment Accumulation (`getLoanMatrix`)**:
   - Melacak `loanPriorYearPaid` untuk setiap `loan.id`.
   - Mengakumulasi `sched.paid_amount` untuk setiap jadwal pinjaman yang jatuh temponya sebelum 1 Januari tahun terpilih (`sched.due_date < startOfYear` atau tahun jatuh tempo < tahun terpilih).
   - Menghitung sisa pokok pra-tahun: `priorYearRemaining = Math.max(0, Number(row.principalAmount || 0) - priorPaid)`.
3. **Unit Testing**:
   - Memperluas `src/services/loanMatrixService.test.ts` dengan skenario multi-tahun:
     - Pinjaman multi-tahun dengan cicilan terbayar di tahun sebelumnya (`priorYearPaid > 0`, `priorYearRemaining < principal`).
     - Pinjaman baru di tahun berjalan (`priorYearPaid = 0`, `priorYearRemaining = principal`).
     - Pinjaman dengan overpaid di tahun sebelumnya (`priorYearRemaining` dibatasi `0` melalui `Math.max(0, ...)`).

## Verification
- Unit test Vitest: `npm test -- --run src/services/loanMatrixService.test.ts` lolos 41 tests (100% pass).
- TypeScript Typecheck: `npm run typecheck` lolos tanpa kompilasi error (`tsc --noEmit` exited with code 0).

## Deferred / Out of Scope
- Render kolom "Saldo Pra Jan-XX (Akumulasi Lampau)" pada UI matriks pinjaman (`LoanMatrix.tsx`) akan dikerjakan pada Wave 2 (Plan 91.2).
