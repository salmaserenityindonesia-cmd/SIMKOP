# Summary Plan 22.2: Halaman Admin Pengaturan Kasir & Integrasi Navigasi Sistem

## Completed Work
1. **Pengaturan Kasir Page Component**:
   - Dibuat `src/pages/admin/PengaturanKasir.tsx` dengan konfigurasi batas waktu penahanan transaksi (`max_hold_duration_minutes`) dengan opsi preset (15 menit, 30 menit, 1 jam, 2 jam, 4 jam, 1 hari).
   - Opsi switch toleransi stok minus (`allow_negative_stock`).
   - Tombol "Bersihkan Kadaluwarsa" manual yang langsung mengeksekusi `cleanupExpiredParkedSales()` dan memulihkan stok inventori secara real-time.
   - Banner notifikasi mode offline/lokal jika tabel `pos_settings` belum termigrasi di database Supabase.
   - Cheat-sheet referensi hotkey POS kasir (F2, F4, F8, F9, Esc).
2. **Routing & Sidebar Integration**:
   - Mendaftarkan rute `/admin/pengaturan-kasir` di `src/App.tsx` dengan proteksi admin (`<ProtectedRoute requireAdmin={true}>`).
   - Menambahkan menu "Pengaturan Kasir" di `src/components/layout/Sidebar.tsx` pada group navigasi `TOKO RETAIL & INVENTORI` khusus role admin.

## Verification
- `npx tsc --noEmit` sukses (exit code 0).
- Navigasi rute dan menu sidebar terintegrasi rapi.

## Commit
Commit hash per-plan dibuat setelah verifikasi.

