---
phase: 78
plan: 1
wave: 1
gap_closure: false
---

# Plan 78.1: Create Atomic Checkout PostgreSQL RPC

## Objective
Membangun fungsi PostgreSQL RPC `public.process_pos_checkout` pada berkas migrasi `supabase/migrations/033_create_atomic_pos_checkout_rpc.sql` yang membungkus seluruh mutasi checkout kasir POS (validasi stok, pengurangan stok `products`, insert `sales` header, insert `sale_items`, pemotongan `deposit_transactions` simpanan belanja, pencatatan `cash_flow`, dan validasi kredit) ke dalam satu transaksi ACID yang atomik.

## Context
Load these files for context:
- `supabase/migrations/016_create_pos_sales_tables.sql`
- `supabase/migrations/021_link_sales_to_cashier_shifts.sql`
- `supabase/migrations/036_pos_spending_from_savings_function.sql`
- `src/services/posCheckoutService.ts`

## Tasks

<task type="auto">
  <name>Build process_pos_checkout Function in Database Migration</name>
  <files>
    supabase/migrations/033_create_atomic_pos_checkout_rpc.sql
  </files>
  <action>
    1. Buat berkas migrasi `supabase/migrations/033_create_atomic_pos_checkout_rpc.sql`.
    2. Definisikan fungsi RPC `public.process_pos_checkout`:
       - Parameter input:
         * `p_sale_number text`
         * `p_member_id uuid DEFAULT NULL`
         * `p_cashier_id uuid DEFAULT NULL`
         * `p_shift_id text DEFAULT NULL`
         * `p_subtotal numeric DEFAULT 0`
         * `p_discount numeric DEFAULT 0`
         * `p_total_amount numeric DEFAULT 0`
         * `p_payment_scheme text DEFAULT 'cash'`
         * `p_paid_cash numeric DEFAULT 0`
         * `p_paid_deposit numeric DEFAULT 0`
         * `p_paid_credit numeric DEFAULT 0`
         * `p_items jsonb DEFAULT '[]'::jsonb`
       - Returns: `jsonb` ({ success: boolean, sale_id: uuid, sale_number: text, message: text })
    3. Alur Eksekusi di dalam Blok Transaksi Transaksional (`LANGUAGE plpgsql SECURITY DEFINER`):
       - Validasi awal:
         * Periksa `p_items` tidak kosong.
         * Cegah non-anggota (`p_member_id IS NULL`) menggunakan `p_paid_deposit > 0` atau `p_paid_credit > 0`.
         * Periksa total pembayaran mencukupi `p_total_amount`.
       - Validasi Stok & Penguncian Baris (`SELECT ... FOR UPDATE`):
         * Lakukan iterasi setiap item di `p_items`.
         * Kunci baris pada tabel `public.products` (`WHERE id = item.product_id FOR UPDATE`).
         * Jika produk tidak ditemukan atau stok tidak mencukupi, lempar `RAISE EXCEPTION` dengan nama barang terkait untuk memicu rollback otomatis.
       - Simpan Header Penjualan (`public.sales`):
         * Hitung nominal kas efektif (`paid_cash` yang proporsional terhadap kembalian).
         * Sisipkan baris ke `public.sales` dengan `shift_id` (cast to uuid jika ada), status `completed`, dan simpan `v_sale_id`.
       - Simpan Item Penjualan & Kurangi Stok:
         * Sisipkan seluruh item ke `public.sale_items` (mengisi `quantity`, `qty`, `unit_price`, `price`, `subtotal`).
         * Kurangi stok produk secara langsung pada `public.products` (`stock = stock - item.quantity, updated_at = NOW()`).
       - Pemotongan Saldo Simpanan Belanja (`p_paid_deposit > 0`):
         * Cari rekening `member_deposits` aktif tipe 'BELANJA' milik anggota.
         * Hitung saldo berjalan secara real-time dari `deposit_transactions`.
         * Jika saldo kurang dari `p_paid_deposit`, lempar `RAISE EXCEPTION 'Saldo Simpanan Belanja tidak mencukupi...'`.
         * Sisipkan mutasi penarikan ke `public.deposit_transactions` (`transaction_type = 'withdrawal'`, `payment_method = 'potong_simpanan_belanja'`, `reference_no = p_sale_number`).
       - Pencatatan Arus Kas (`v_effective_paid_cash > 0`):
         * Sisipkan pemasukan ke `public.cash_flow` (`direction = 'in'`, `category = 'penjualan_tunai'`, `reference_id = v_sale_id`).
       - Hak Akses:
         * Berikan hak eksekusi: `GRANT EXECUTE ON FUNCTION public.process_pos_checkout TO authenticated, anon, service_role;`
  </action>
  <verify>
    Verifikasi sintaks SQL valid dan tidak terdapat reserved keyword conflict.
  </verify>
  <done>
    Fungsi RPC `process_pos_checkout` siap dipanggil secara aman dan atomik dari backend/frontend.
  </done>
</task>

