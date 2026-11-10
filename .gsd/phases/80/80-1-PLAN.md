# Plan 80.1: Database Migration & Atomic Stored Function (PostgreSQL)

## Objective
Membangun berkas migrasi Supabase `supabase/migrations/044_create_atomic_purchase_invoice_rpc.sql` yang mendefinisikan fungsi RPC PostgreSQL atomik `public.create_purchase_invoice_atomic`:
1. Menerima parameter:
   - `p_invoice_number TEXT`
   - `p_purchase_date DATE DEFAULT CURRENT_DATE`
   - `p_items JSONB` (array produk restock dengan ID produk, kuantitas, harga beli)
   - `p_user_id UUID DEFAULT NULL`
   - `p_user_name TEXT DEFAULT NULL`
2. Melakukan validasi:
   - Nomor faktur wajib diisi dan tidak boleh string kosong.
   - Array `p_items` tidak boleh kosong, setiap item harus memiliki kuantitas > 0 dan harga beli >= 0.
3. Mengunci setiap baris produk master di tabel `public.products` (`SELECT ... FOR UPDATE`) untuk mencegah race condition mutasi stok konkuren.
4. Menghitung total nilai faktur (`SUM(qty * buy_price)`).
5. Menyisipkan rekaman faktur induk ke `public.purchases`.
6. Menyisipkan rincian item ke `public.purchase_items`.
7. Memperbarui stok produk (`stock = stock + item.qty`) dan memperbarui harga beli master (`buy_price = item.buy_price`).
8. Mencatat jejak audit ke tabel `public.audit_logs` jika tersedia.
9. Mengembalikan seluruh detail faktur dalam format JSONB yang terstandarisasi.
10. Memberikan hak eksekusi RLS `GRANT EXECUTE` kepada `authenticated, anon, service_role`.
