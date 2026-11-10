# Summary 79.2: Service Layer Refactoring & Compatibility Fallbacks in loanService.ts

## Accomplished
- Dibuat berkas tipe data kontrak `src/types/loan.ts` (`ApproveLoanRpcPayload`, `ApproveLoanRpcResponse`, `RecordLoanRepaymentRpcPayload`, `RecordLoanRepaymentRpcResponse`, `PayScheduleResult`, `MakePaymentResult`).
- Direfaktor fungsi `loanService.approveLoan` pada `src/services/loanService.ts`:
  - Terlebih dahulu memanggil PostgreSQL RPC atomik `public.approve_loan_atomic`.
  - Dilengkapi mekanisme fallback ke query sekuensial tabel (`loans.update` dan `loan_schedules.insert`) apabila RPC belum terpasang atau terjadi error schema cache.
- Direfaktor fungsi `loanService.paySchedule` pada `src/services/loanService.ts`:
  - Memanggil PostgreSQL RPC atomik `public.record_loan_repayment_atomic` dengan `p_schedule_id` spesifik.
  - Mengembalikan objek respons terstandar (`success`, `newStatus`, `newPaidTotal`, `sisaPinjaman`, `isAllPaid`, `repaymentId`, `receiptNumber`).
  - Dilengkapi fallback ke alur isolasi baris jadwal klien jika RPC tidak tersedia.
- Direfaktor fungsi `loanService.makePayment` pada `src/services/loanService.ts`:
  - Memanggil PostgreSQL RPC atomik `public.record_loan_repayment_atomic` dengan `p_schedule_id: null` untuk alokasi FIFO otomatis.
  - Dilengkapi fallback ke alur perulangan FIFO klien jika RPC tidak tersedia.
- Seluruh 29 unit test yang sudah ada di `src/services/loanService.test.ts` tetap lulus 100% tanpa regresi.

