# Summary 80.1: Database Migration & Atomic Stored Function (PostgreSQL)

## Accomplished
- Dibuat migration berkas `supabase/migrations/044_create_atomic_purchase_invoice_rpc.sql`.
- Didefinisikan fungsi RPC `public.create_purchase_invoice_atomic(p_invoice_number TEXT, p_purchase_date DATE, p_items JSONB, p_user_id UUID, p_user_name TEXT)`:
  - Memvalidasi parameter nomor faktur dan array produk.
  - Mengunci baris master produk yang direstock (`SELECT ... FOR UPDATE`) untuk mencegah race condition.
  - Memperbarui stok dan harga beli produk secara atomik.
  - Menyisipkan data faktur ke `public.purchases` dan detail item ke `public.purchase_items`.
  - Mencatat histori ke `public.audit_logs`.
  - Mengembalikan objek JSONB lengkap yang memuat informasi faktur tersimpan.
- Diberikan hak akses RLS `GRANT EXECUTE` kepada `authenticated, anon, service_role`.
