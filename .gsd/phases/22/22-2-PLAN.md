---
phase: 22
plan: 2
wave: 2
gap_closure: false
---

# Plan 22.2: Halaman Admin Pengaturan Kasir & Integrasi Navigasi Sistem

## Objective
Membangun antarmuka halaman admin `PengaturanKasir.tsx` untuk mengelola parameter transaksi kasir POS, terutama durasi timeout penahanan barang belanjaan (`max_hold_duration_minutes`) dan toleransi stok minus. Mendaftarkan routing pada `App.tsx` dengan proteksi admin dan menambahkan tautan menu pada `Sidebar.tsx`.

## Context
Load these files for context:
- src/pages/admin/PengaturanKoperasi.tsx
- src/services/posSettingsService.ts
- src/components/layout/Sidebar.tsx
- src/App.tsx

## Tasks

<task type="auto">
  <name>Build Pengaturan Kasir Page Component</name>
  <files>
    src/pages/admin/PengaturanKasir.tsx
  </files>
  <action>
    Buat komponen `src/pages/admin/PengaturanKasir.tsx`:
    1. UI Header:
       - Judul: "Pengaturan Kasir & Transaksi POS"
       - Subtitle: "Konfigurasi durasi penahanan transaksi, auto-restock inventori, dan parameter operasional kasir."
    2. Visual Alert / Status Banner:
       - Tampilkan peringatan ramah admin jika tabel Supabase belum termigrasi (menggunakan `isTableMigratedInSupabase` atau flag `isLocalFallback`).
       - Sediakan instruksi singkat untuk menjalankan SQL `018_pos_settings_and_parked_auto_expire.sql`.
    3. Form Input Pengaturan:
       - Input angka: "Batas Waktu Tahan Transaksi (Menit)" dengan validasi minimal 5 menit, maksimal 1440 menit (24 jam).
       - Quick select buttons / presets durasi (e.g. 30 Menit, 1 Jam, 2 Jam, 4 Jam).
       - Switch / Checkbox: "Izinkan Penjualan Stok Minus" (default: false).
       - Cheat-sheet referensi hotkey kasir POS (F2 Pencarian, F4 Qty, F8 Tahan Transaksi, F9 Pembayaran, Esc Batal).
    4. Feedback & State Management:
       - State loading saat memuat konfigurasi dari `posSettingsService.getPosSettings()`.
       - Tombol simpan dengan loading state dan integrasi `useFeedback().showToast()`.
  </action>
  <verify>
    Komponen dapat di-render tanpa type error, nilai tersimpan dan termuat kembali saat refresh.
  </verify>
  <done>
    Halaman pengaturan kasir siap digunakan oleh administrator koperasi.
  </done>
</task>

<task type="auto">
  <name>Register Pengaturan Kasir Route and Sidebar Navigation</name>
  <files>
    src/App.tsx
    src/components/layout/Sidebar.tsx
  </files>
  <action>
    1. Daftarkan rute baru di `src/App.tsx`:
       - Import `PengaturanKasir` dari `./pages/admin/PengaturanKasir`.
       - Tambahkan Route `/admin/pengaturan-kasir` di bawah `<ProtectedRoute requireAdmin={true}>`.
    2. Perbarui `src/components/layout/Sidebar.tsx`:
       - Tambahkan icon `SlidersHorizontal` (atau `Settings2`) dari `lucide-react`.
       - Pada menu group `TOKO RETAIL & INVENTORI`, tambahkan item:
         `{ label: 'Pengaturan Kasir', icon: SlidersHorizontal, href: '/admin/pengaturan-kasir', adminOnly: true }`.
  </action>
  <verify>
    Navigasi menuju `/admin/pengaturan-kasir` muncul di sidebar admin dan halaman terbuka dengan benar.
  </verify>
  <done>
    Rute dan navigasi sidebar terintegrasi sepenuhnya.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Admin dapat mengakses halaman `/admin/pengaturan-kasir`.
- [ ] Durasi penahanan transaksi dapat diubah dan disimpan secara persisten.
- [ ] Tautan menu muncul di sidebar kategori Toko Retail & Inventori khusus role admin.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero build warnings / errors

