# Summary 79.1: Database Migration & Atomic Stored Functions (PostgreSQL)

## Accomplished
- Dibuat migration berkas `supabase/migrations/043_create_atomic_loan_transactions_rpc.sql`.
- Didefinisikan fungsi RPC `public.approve_loan_atomic(p_loan_id UUID, p_start_date DATE)` yang mengunci baris pinjaman (`FOR UPDATE`), memvalidasi status, mengupdate data pinjaman ke `approved`, dan mengenerate baris `loan_schedules` secara atomik dalam satu blok transaksi ACID.
- Didefinisikan fungsi RPC `public.record_loan_repayment_atomic(p_loan_id UUID, p_amount_paid NUMERIC, p_payment_method TEXT, p_schedule_id UUID, p_notes TEXT, p_receipt_number TEXT)` yang mendukung pembayaran jadwal tunggal (terisolasi) maupun pembayaran FIFO lintas jadwal, mengunci baris `FOR UPDATE`, mengupdate `loan_schedules`, menyisipkan bukti ke `loan_repayments`, merevisi `loans.sisa_pinjaman` & `status`, serta memutakhirkan status resign anggota (`READY_TO_RESIGN`) secara ACID.
- Ditambahkan hak eksekusi RLS `GRANT EXECUTE` untuk `authenticated, anon, service_role`.
