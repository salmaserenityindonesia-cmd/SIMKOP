## Current Position
- **Phase**: 22
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 22 (Tahan Transaksi POS (F8), Auto-Expire Restock & Pengaturan Kasir) planning completed:
- Dekomposisi 4 Execution Waves (Plans 22.1 - 22.4):
  * **Plan 22.1 (Wave 1)**: Database Migration (`supabase/migrations/018_pos_settings_and_parked_auto_expire.sql`) dengan tabel `pos_settings`, kolom `expires_at` pada `sales`, RPC `cleanup_expired_parked_sales()` untuk pengembalian stok otomatis, serta resilient service layer `posSettingsService.ts`.
  * **Plan 22.2 (Wave 2)**: Halaman Admin `src/pages/admin/PengaturanKasir.tsx` untuk konfigurasi batas durasi penahanan transaksi (menit), switch toleransi minus, registrasi rute `/admin/pengaturan-kasir` di `App.tsx`, dan tautan menu di `Sidebar.tsx`.
  * **Plan 22.3 (Wave 3)**: Pengalihan hotkey Tahan Transaksi dari F12 ke F8 (menghapus tombol F8 Diskon), modal daftar belanja ditahan `ParkedTransactionsModal.tsx` dengan aksi Reload (Muat Kembali) dan Hapus (Cancel & Restore Stock), serta background cleanup kadaluwarsa.
  * **Plan 22.4 (Wave 4)**: Unit tests `src/services/posSettingsService.test.ts` (menguji default, localStorage fallback, error schema cache, RPC/client cleanup) serta validasi menyeluruh `vitest` dan `npm run build`.

## Next Steps
1. `/execute 22`

## Blockers
- None.

## Context Dump

### Decisions Made
- **Hotkey Repurposing (F12 -> F8)**: F12 selalu berbenturan dengan browser Developer Tools. F8 (Diskon) tidak digunakan karena diskon anggota dihitung otomatis (5%). Sehingga F8 dialokasikan sepenuhnya untuk Tahan Transaksi.
- **Stock Reservation & Restock Guarantee**: Saat transaksi ditahan (parked), stok langsung dikurangi di tabel `products` untuk menghindari penjualan ganda (over-selling). Jika transaksi dibatalkan (dihapus manual atau kadaluwarsa via auto-cleanup RPC), stok secara otomatis dikembalikan ke `products`.
- **Resilient Layered Storage**: `posSettingsService` mengadopsi pola in-memory -> Supabase -> localStorage -> default 120 menit, menjamin kestabilan kasir meski DDL migrasi belum diaplikasikan di server Supabase.
