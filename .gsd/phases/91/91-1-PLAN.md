---
phase: 91
plan: 1
wave: 1
gap_closure: false
---

# Plan 91.1: Calculate Prior-Year Repayments in loanMatrixService.ts

## Objective
Menambahkan kalkulasi saldo awal pinjaman terbayar dan sisa pokok hutang sebelum tahun filter berjalan (`priorYearPaid` dan `priorYearRemaining`) pada service `src/services/loanMatrixService.ts`, serta memperluas interface `LoanMatrixMember` / `LoanMatrixRow`.

## Context
- `src/services/loanMatrixService.ts`
- `src/services/loanMatrixService.test.ts`

Saat `getLoanMatrix(year)` dipanggil:
- Seluruh schedules pinjaman sudah di-fetch (`in('loan_id', loanIds).order('due_date', { ascending: true })`).
- Untuk tiap pinjaman (`loan.id`), hitung angsuran terbayar yang tanggal jatuh temponya (`due_date`) sebelum `year-01-01` (`priorYearPaid`).
- Hitung sisa pinjaman pada awal tahun terpilih:
  - `principal = Number(loan.principal_amount || loan.amount || 0)`
  - `priorYearRemaining = Math.max(0, principal - priorYearPaid)`
- Sematkan `priorYearPaid` dan `priorYearRemaining` pada tipe `LoanMatrixMember` dan objek baris matriks.
- Perbarui unit test pada `loanMatrixService.test.ts` untuk memverifikasi kalkulasi `priorYearPaid` dan `priorYearRemaining`.

## Tasks

<task type="auto">
  <name>Aggregate Prior-Year Repayments per Loan in Service Layer</name>
  <files>
    src/services/loanMatrixService.ts
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`:
       - Tambahkan properti opsional ke interface `LoanMatrixMember`:
         - `priorYearPaid?: number;`
         - `priorYearRemaining?: number;`
       - Di dalam loop iterasi schedules pada `getLoanMatrix(year)`:
         - Lacak akumulasi pembayaran angsuran yang jatuh tempo sebelum 1 Januari tahun terpilih:
           `const isBeforeSelectedYear = scheduleYear < year;`
           Jika `isBeforeSelectedYear`, tambahkan `Number(sched.paid_amount || 0)` ke total `priorYearPaid` untuk `loan.id`.
         - Pada saat mapping / penyelesaian baris `loansMap[loan.id]`:
           Hitung `priorYearRemaining = Math.max(0, Number(row.principalAmount || 0) - (row.priorYearPaid || 0))`.
    2. Tambahkan unit test di `src/services/loanMatrixService.test.ts`:
       - Verifikasi bahwa pinjaman dengan jadwal di tahun sebelum `year` memiliki `priorYearPaid` dan `priorYearRemaining` yang tepat.
    3. Jalankan pengujian `npm test -- --run src/services/loanMatrixService.test.ts`.
  </action>
  <verify>
    `npm test -- --run src/services/loanMatrixService.test.ts` lolos tanpa error.
  </verify>
</task>

