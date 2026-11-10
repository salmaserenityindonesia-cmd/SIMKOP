# Plan 79.2: Service Layer Refactoring & Compatibility Fallbacks in loanService.ts

## Objective
Memperbarui layer service `src/services/loanService.ts` agar memanfaatkan RPC atomik baru (`approve_loan_atomic` dan `record_loan_repayment_atomic`):
1. `approveLoan(loanId: string, startDate: string)`:
   - Mencoba pemanggilan `supabase.rpc('approve_loan_atomic', { p_loan_id: loanId, p_start_date: startDate })`.
   - Mengembalikan data loan terkonfirmasi.
   - Menyediakan fallback kompatibilitas ke direct table queries jika RPC belum dimigrasi di remote instance.
2. `paySchedule(...)` dan `makePayment(...)`:
   - Memanggil `supabase.rpc('record_loan_repayment_atomic', { ... })` untuk mengeksekusi pembayaran secara ACID.
   - Mengembalikan format respon yang selaras dengan ekspektasi caller (`{ success: true, newStatus, newPaidTotal, sisaPinjaman, isAllPaid }`).
   - Menyediakan fallback kompatibilitas ke alur client-side queries jika RPC belum diterapkan atau error schema cache.
3. Memastikan fungsi wrapper `loanScheduleService.paySchedule` dan modal/caller frontend tetap berfungsi 100% tanpa breaking changes pada antarmuka publiknya.

