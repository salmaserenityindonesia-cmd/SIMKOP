# Summary Plan 22.1: Migrasi Skema Database pos_settings & Service Layer Konfigurasi Kasir

## Completed Work
1. **Migration File**:
   - Dibuat `supabase/migrations/018_pos_settings_and_parked_auto_expire.sql`.
   - Skema tabel `pos_settings` dengan single-row constraint (`id = 1`), default timeout 120 menit, flag `allow_negative_stock`, dan RLS policies.
   - Penambahan kolom `expires_at` pada `sales`, sinkronisasi kompatibilitas `status` dan `sale_status`, serta normalisasi kolom `quantity` dan `qty` pada `sale_items`.
   - Fungsi PostgreSQL RPC `cleanup_expired_parked_sales()` untuk pengembalian stok barang yang ditahan secara otomatis ke tabel `products` saat kadaluwarsa.
2. **Resilient Service Layer**:
   - Dibuat `src/services/posSettingsService.ts` dengan strategi pembacaan berlapis: In-memory Cache -> Supabase PostgREST -> `localStorage` (`simkop_pos_settings`) -> Default (120 menit).
   - Penanganan ramah schema cache (`42P01` / `PGRST205`) pada `updatePosSettings` sehingga UI tidak mengalami crash saat tabel cloud belum termigrasi.
   - Fungsi `cleanupExpiredParkedSales()` yang mendukung pemanggilan RPC Supabase dan fallback client-side query jika RPC belum di-cache oleh PostgREST.

## Verification
- `npx tsc --noEmit` sukses (exit code 0).
- Sintaks SQL PostgreSQL valid dan siap dijalankan di Supabase SQL Editor.

## Commit
Commit hash per-plan dibuat setelah verifikasi.
