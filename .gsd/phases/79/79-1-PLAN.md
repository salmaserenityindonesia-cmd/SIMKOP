# Plan 79.1: Database Migration & Atomic Stored Functions (PostgreSQL)

## Objective
Membangun berkas migrasi Supabase `supabase/migrations/043_create_atomic_loan_transactions_rpc.sql` yang mendefinisikan dua stored procedure / RPC atomik:
1. `public.approve_loan_atomic(p_loan_id UUID, p_start_date DATE)`:
   - Mengambil & mengunci pinjaman (`SELECT ... FOR UPDATE`)
   - Memvalidasi status pinjaman saat ini (`draft`, `pending`, `submitted`)
   - Mengupdate pinjaman: `status = 'approved'`, `disbursed_at = p_start_date`
   - Menghasilkan dan memasukkan seluruh baris jadwal angsuran (`loan_schedules`) secara otomatis sesuai `tenor`, `monthly_target`, dan `due_date` bulanan
   - Mengembalikan data pinjaman yang telah disetujui dalam bentuk JSONB
2. `public.record_loan_repayment_atomic(p_loan_id UUID, p_amount_paid NUMERIC, p_payment_method TEXT, p_schedule_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_receipt_number TEXT DEFAULT NULL)`:
   - Mengambil & mengunci baris pinjaman (`loans FOR UPDATE`)
   - Jika `p_schedule_id` diberikan:
     - Mengunci baris `loan_schedules FOR UPDATE`
     - Menghitung penambahan `paid_amount`, pembulatan nominal, dan penetapan status (`paid` vs `partial` vs `unpaid` dengan toleransi pembulatan +/- 5 Rupiah)
     - Mengupdate `loan_schedules`
     - Mencatat mutasi ke `loan_repayments` (meneruskan nomor kwitansi atau auto-generated oleh trigger)
   - Jika `p_schedule_id` NULL:
     - Mengalokasikan dana secara FIFO ke jadwal angsuran `unpaid` / `partial` terurut `period_number ASC`
     - Mengupdate jadwal-jadwal yang terbayar dan mencatat `loan_repayments` per baris alokasi
   - Menghitung ulang total pembayaran seluruh jadwal dan `sisa_pinjaman = MAX(0, principal_amount - total_paid)`
   - Mengupdate status `loans`: `'paid_off'` (atau `'completed'`) jika seluruh jadwal lunas, atau tetap `'active'`
   - Mendeteksi jika peminjam berstatus `'PENDING_RESIGNED'` dan seluruh pinjamannya sudah lunas $\rightarrow$ auto update status anggota ke `'READY_TO_RESIGN'`
   - Mengembalikan detail hasil pembayaran dalam format JSONB:
     `{ success: true, new_status, new_paid_total, sisa_pinjaman, is_all_paid, excess_amount, repayment_id, receipt_number }`
   - Memberikan hak eksekusi RLS (`GRANT EXECUTE ON FUNCTION ... TO authenticated, anon, service_role`)

