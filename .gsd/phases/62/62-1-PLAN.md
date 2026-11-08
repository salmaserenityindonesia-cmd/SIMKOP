---
phase: 62
plan: 1
wave: 1
gap_closure: false
---

# Plan 62.1: Data Contract & Cumulative Paid Calculation Engine

## Objective
Menyediakan kalkulasi akumulasi nominal angsuran terbayar (cumulative paid amount) sejak awal masa pinjaman hingga periode/bulan tertentu pada `src/services/loanMatrixService.ts`:
1. Memperluas interface `LoanMatrixMonth` dengan atribut opsional `cumulativePaidAmount?: number`.
2. Pada fungsi `getLoanMatrix(year: number)`, memperbarui iterasi seluruh jadwal pinjaman (yang telah terurut `due_date: ascending`) agar melacak running total akumulasi terbayar per pinjaman (`loanCumulativePaid[loan.id] += Number(sched.paid_amount || 0)`), lalu menyimpannya ke `membersMap[member.id].months[month].cumulativePaidAmount`.
3. Menambahkan dan mengekspor fungsi helper `getCumulativePaidUpToMonth(member: LoanMatrixMember, targetMonth: number, targetYear?: number): number` sebagai utilitas kalkulasi kumulatif berbasis struktur member matriks (atau fallback).
4. Menyusun unit tests komprehensif di `src/services/loanMatrixService.test.ts` untuk menguji running accumulation per loan dan helper function.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts

## Tasks

<task type="auto">
  <name>Enrich LoanMatrixMonth and Implement Cumulative Paid Engine</name>
  <files>
    src/services/loanMatrixService.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`.
    2. Tambahkan properti `cumulativePaidAmount?: number;` pada interface `LoanMatrixMonth`.
    3. Pada fungsi `getLoanMatrix(year: number)`:
       - Buat tracking map running akumulasi: `const loanCumulativePaid: Record<string, number> = {};`
       - Di dalam loop `(schedules || []).forEach((sched: any) => { ... })`:
         - Sebelum atau sesudah perhitungan `loanBalances`, update akumulasi:
           ```typescript
           if (loanCumulativePaid[loan.id] === undefined) {
             loanCumulativePaid[loan.id] = 0;
           }
           loanCumulativePaid[loan.id] += Number(sched.paid_amount || 0);
           ```
         - Pada blok `if (scheduleYear === year)` saat mengisi `membersMap[member.id].months[month]`, tambahkan:
           ```typescript
           cumulativePaidAmount: loanCumulativePaid[loan.id],
           ```
    4. Buat dan ekspor helper function `getCumulativePaidUpToMonth`:
       ```typescript
       export const getCumulativePaidUpToMonth = (
         member: LoanMatrixMember,
         targetMonth: number,
         targetYear?: number
       ): number => {
         if (!member || !member.months) return 0;
         const targetCell = member.months[targetMonth];
         if (targetCell?.cumulativePaidAmount !== undefined) {
           return targetCell.cumulativePaidAmount;
         }
         // Fallback: jumlahkan paidAmount dari bulan 1 sampai targetMonth untuk loanId yang sama
         let total = 0;
         const targetLoanId = targetCell?.loanId;
         for (let m = 1; m <= targetMonth; m++) {
           const cell = member.months[m];
           if (cell && (!targetLoanId || cell.loanId === targetLoanId)) {
             total += Number(cell.paidAmount || 0);
           }
         }
         return total;
       };
       ```
    5. Pastikan semua types dan signatures diekspor dengan benar tanpa mengubah fungsionalitas yang sudah ada.
  </action>
  <verify>
    Jalankan pemeriksaan tipe data: `npx tsc --noEmit`
  </verify>
  <done>
    `LoanMatrixMonth` memiliki field `cumulativePaidAmount`, `getLoanMatrix` mengisi nilai kumulatif terbayar, dan helper `getCumulativePaidUpToMonth` tersedia.
  </done>
</task>

<task type="auto">
  <name>Unit Testing Cumulative Paid Calculation Engine</name>
  <files>
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.test.ts`.
    2. Tambahkan test suite untuk `cumulativePaidAmount` dan `getCumulativePaidUpToMonth`:
       - Menguji helper `getCumulativePaidUpToMonth` dengan data matriks member yang memiliki beberapa bulan berstatus PAID dan PARTIAL.
       - Memastikan akumulasi bulan ke-1, bulan ke-2, dan bulan ke-3 bertambah secara kumulatif.
       - Menguji fallback saat `cumulativePaidAmount` belum terdefinisi pada cell.
       - Menguji simulasi `getLoanMatrix` (dengan mock supabase) bahwa `cumulativePaidAmount` pada setiap sel bulan merefleksikan total angsuran terbayar sampai bulan tersebut.
  </action>
  <verify>
    Jalankan test suite service:
    `npx vitest run src/services/loanMatrixService.test.ts`
  </verify>
  <done>
    Seluruh test di `src/services/loanMatrixService.test.ts` lulus 100%.
  </done>
</task>

## Success Criteria
- [ ] Interface `LoanMatrixMonth` memiliki `cumulativePaidAmount?: number`
- [ ] `getLoanMatrix` menghitung akumulasi terbayar secara kronologis untuk setiap pinjaman
- [ ] Helper `getCumulativePaidUpToMonth` tersedia dan diekspor
- [ ] Test unit di `src/services/loanMatrixService.test.ts` lulus tanpa error

