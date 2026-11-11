# Plan 80.2: Service Layer Refactoring & Compatibility Fallbacks in koperasiService.ts

## Objective
Memperbarui fungsi `catatRestockFaktur` di `src/services/koperasiService.ts`:
1. Memeriksa keberadaan `supabase.rpc` dan memanggil `supabase.rpc('create_purchase_invoice_atomic', { ... })`.
2. Meneruskan parameter nomor faktur, tanggal, array item (`product_id`, `qty`, `buy_price`), dan informasi pengguna saat ini.
3. Mengembalikan format `FakturPembelian` yang sinkron (`id`, `noFaktur`, `tanggal`, `items`, `totalNilai`).
4. Menyediakan fallback kompatibilitas ke operasi tabel sekuensial (dan in-memory mock jika tabel belum termigrasi) saat fungsi RPC belum terpasang di remote database (`PGRST202` / `42883`).
5. Memastikan pemanggil UI di `src/pages/admin/ManajemenPembelian.tsx` tetap bekerja tanpa perubahan breaking.

