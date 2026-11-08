---
phase: 61
plan: 1
wave: 1
gap_closure: false
---

# Plan 61.1: Data Engine for Loan Repayment Grid & Reconcile

## Objective
Membangun service engine untuk buku bantu angsuran pinjaman interaktif pada `src/services/loanMatrixService.ts`:
1. `getLoanInteractiveGrid(loanId: string)`: Mengambil data pinjaman, schedules terurut, repayments, menghitung agregat ringkasan saldo, dan memetakan metadata visual per periode.
2. `toggleLoanSchedulePaid(scheduleId: string, paid: boolean, payload?: ...)`: Menandai jadwal lunas (insert repayment & update schedule) atau membatalkan pelunasan.
3. `autoReconcileLoanInstallments(loanId: string, totalPaidAvailable: number)`: Alokasi FIFO massal dana terangsur ke barisan jadwal angsuran.
4. `checkAllLoanUpToCurrentMonth(loanId: string)`: Menandai lunas seluruh jadwal yang jatuh tempo s/d bulan berjalan.
5. `uncheckAllLoanSchedules(loanId: string)`: Mereset seluruh pelunasan jadwal pinjaman.
Serta menyusun unit tests komprehensif di `src/services/loanMatrixService.test.ts`.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts
- src/services/savingsMatrixService.ts

## Tasks

<task type="auto">
  <name>Build Loan Schedule Grid Engine in loanMatrixService.ts</name>
  <files>
    src/services/loanMatrixService.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`.
    2. Definisikan interface terkait:
       ```typescript
       export interface LoanGridPeriod {
         id: string;
         loanId: string;
         periodNumber: number;
         dueDate: string;
         targetAmount: number;
         paidAmount: number;
         status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED';
         label: string; // e.g. "Bulan 1 [Jul-26]"
         isCurrentMonth: boolean;
         repayments: Array<{
           id: string;
           amountPaid: number;
           paymentDate: string;
           paymentMethod: string;
           notes: string | null;
         }>;
       }

       export interface LoanInteractiveGridSummary {
         loanId: string;
         loanNumber: string;
         memberId: string;
         memberName: string;
         memberNrp: string;
         principalAmount: number;
         tenor: number;
         monthlyTarget: number;
         disbursedAt: string | null;
         totalPaid: number;
         sisaPinjaman: number;
         isBalanced: boolean;
         periods: LoanGridPeriod[];
       }
       ```
    3. Implementasikan fungsi `getLoanInteractiveGrid(loanId: string)`:
       - Query data `loans` beserta relasi `member:anggota(id, nama, nrp)`.
       - Query `loan_schedules` untuk `loan_id` diurutkan berdasarkan `period_number ASC`.
       - Query `loan_repayments` untuk `loan_id` diurutkan berdasarkan `payment_date ASC`.
       - Hitung `totalPaid`, `sisaPinjaman = Math.max(0, principalAmount - totalPaid)`, `isBalanced = totalPaid >= principalAmount`.
       - Petakan setiap schedule menjadi `LoanGridPeriod` dengan logika status (jika `paid_amount >= target_amount` -> 'PAID', jika `paid_amount > 0` -> 'PARTIAL', jika tanggal jatuh tempo di masa depan -> 'PROJECTED', jika tanggal lewat -> 'UNPAID').
    4. Implementasikan fungsi `toggleLoanSchedulePaid(scheduleId: string, paid: boolean, payload?: { amount?: number; receiptNo?: string; notes?: string; paymentMethod?: string })`:
       - Ambil schedule terkait.
       - Jika `paid = true`:
         - Nominal bayar = `payload?.amount ?? schedule.target_amount`.
         - Insert record ke `loan_repayments` dengan `notes` yang mencatat kwitansi/catatan.
         - Update `loan_schedules` dengan `paid_amount = target_amount` (atau amount) dan `status = 'paid'`.
         - Jika seluruh schedules untuk pinjaman tersebut lunas, update `loans.status = 'completed'`.
       - Jika `paid = false`:
         - Hapus entri di `loan_repayments` untuk `schedule_id = scheduleId`.
         - Update `loan_schedules` dengan `paid_amount = 0` dan `status = 'unpaid'`.
         - Jika `loans.status === 'completed'`, kembalikan menjadi 'active'.
    5. Implementasikan `autoReconcileLoanInstallments(loanId: string, totalPaidAvailable: number)`:
       - Ambil semua jadwal pinjaman terurut `period_number ASC`.
       - Hapus repayments lama pada schedule pinjaman ini.
       - Terapkan FIFO allocation: alokasikan `totalPaidAvailable` dari periode 1 hingga dana habis.
       - Update masing-masing `loan_schedules` (`paid_amount`, `status`).
       - Catat entri `loan_repayments` yang sesuai.
    6. Implementasikan `checkAllLoanUpToCurrentMonth(loanId: string)`:
       - Cari seluruh jadwal yang `due_date` <= akhir bulan berjalan saat ini.
       - Setel lunas seluruh jadwal tersebut dan catat repayment yang diperlukan.
    7. Implementasikan `uncheckAllLoanSchedules(loanId: string)`:
       - Hapus seluruh `loan_repayments` untuk pinjaman ini.
       - Update seluruh `loan_schedules` menjadi `paid_amount = 0`, `status = 'unpaid'`.
       - Set `loans.status = 'active'`.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Fungsi-fungsi engine grid interaktif dan alokasi FIFO pinjaman berhasil dikompilasi tanpa kesalahan tipe.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for Loan Interactive Grid Engine in loanMatrixService.test.ts</name>
  <files>
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.test.ts`.
    2. Tambahkan unit test suite untuk:
       - `getLoanInteractiveGrid`: mengembalikan struktur ringkasan, perhitungan `totalPaid` dan `sisaPinjaman`, serta mapping periods.
       - `toggleLoanSchedulePaid`: menguji skenario check (bayar lunas) dan uncheck (batal lunas).
       - `autoReconcileLoanInstallments`: menguji alokasi FIFO (lunas penuh di periode awal, parsial di periode terakhir tersisa, dan nol di periode selanjutnya).
       - `checkAllLoanUpToCurrentMonth`: menguji centang massal s/d bulan ini.
       - `uncheckAllLoanSchedules`: menguji reset seluruh jadwal.
    3. Jalankan pengujian vitest.
  </action>
  <verify>
    npx vitest run src/services/loanMatrixService.test.ts
  </verify>
  <done>
    Seluruh pengujian unit test di loanMatrixService.test.ts lulus 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Fungsi `getLoanInteractiveGrid`, `toggleLoanSchedulePaid`, `autoReconcileLoanInstallments`, `checkAllLoanUpToCurrentMonth`, `uncheckAllLoanSchedules` diekspor dari `loanMatrixService.ts`.
- [ ] Seluruh unit test lulus di `src/services/loanMatrixService.test.ts`.

## Success Criteria
- [ ] TypeScript check lolos (`npx tsc --noEmit`).
- [ ] Unit tests engine grid pinjaman hijau 100%.
