---
phase: 33
plan: 1
wave: 1
gap_closure: false
---

# Plan 33.1: Pindahkan Kelompok Menu Toko Retail & Inventori ke Atas Simpan Pinjam

## Objective
Memindahkan seluruh kelompok menu "TOKO RETAIL & INVENTORI" beserta 7 submenunya ke atas kelompok "SIMPAN PINJAM (KSP / USP)", tepat di bawah tombol/kelompok "Dashboard Operasional" (`groupName: 'OPERASIONAL'`) pada sidebar navigasi admin (`src/components/layout/Sidebar.tsx` / `AdminSidebar.tsx`) sesuai kebutuhan operasional harian koperasi.

## Context
Load these files for context:
- src/components/layout/Sidebar.tsx
- src/components/layout/AdminSidebar.tsx

## Tasks

<task type="auto">
  <name>Move TOKO RETAIL & INVENTORI Menu Group to Top Position</name>
  <files>
    src/components/layout/Sidebar.tsx
    src/components/layout/AdminSidebar.tsx
  </files>
  <action>
    1. Buka berkas komponen sidebar admin (`src/components/layout/Sidebar.tsx`).
    2. Pada array konfigurasi `navigationGroups`:
       - Pindahkan blok kelompok `groupName: 'TOKO RETAIL & INVENTORI'` ke posisi setelah `groupName: 'OPERASIONAL'` dan sebelum `groupName: 'SIMPAN PINJAM (KSP / USP)'`.
    3. Pastikan susunan hierarki grup menu menjadi:
       - **OPERASIONAL** (Dashboard Operasional: `/admin`)
       - **TOKO RETAIL & INVENTORI**:
         - Kasir (POS): `/admin/kasir`
         - Inventori Produk: `/admin/produk`
         - Kategori Produk: `/admin/kategori`
         - Manajemen Pembelian: `/admin/pembelian`
         - Retur Pembelian: `/admin/retur-pembelian`
         - Pengaturan Kasir: `/admin/pengaturan-kasir` (adminOnly: true)
         - Laporan Retail & Stok: `/admin/laporan-retail`
       - **SIMPAN PINJAM (KSP / USP)**:
         - Master Produk Koperasi: `/admin/master-simpan-pinjam` (adminOnly: true)
         - Pusat Terima Setoran: `/admin/setoran`
         - Tagihan Simpanan: `/admin/simpanan`
         - Penarikan Simpanan: `/admin/penarikan-simpanan`
         - Pengajuan Pinjaman: `/admin/pengajuan-pinjaman`
         - Approval Pinjaman: `/admin/approval` (adminOnly: true)
         - Matriks Simpanan: `/admin/compliance-matrix`
         - Matriks Pinjaman: `/admin/loan-matrix`
       - **UTILITY & REKONSILIASI GAJI**:
         - Import Gaji & Rekening: `/admin/import-gaji` (adminOnly: true)
         - Update Massal Bulanan: `/admin/batch-update` (adminOnly: true)
         - Kliring & Clearance Anggota: `/admin/clearance` (adminOnly: true)
       - **MANAJEMEN & AKSES**:
         - Manajemen Anggota: `/admin/anggota`
         - Manajemen User: `/admin/users` (adminOnly: true)
         - Pengaturan Koperasi: `/admin/pengaturan` (adminOnly: true)
       - **LAPORAN & ANALITIK**:
         - Laporan Keuangan: `/admin/laporan-keuangan` (adminOnly: true)
    4. Pastikan `src/components/layout/AdminSidebar.tsx` tetap mere-export `Sidebar.tsx` secara valid.
    5. Jaga konsistensi styling separator border, label header uppercase, ikon Lucide, rute path, serta active state indicator.
  </action>
  <verify>
    Periksa array `navigationGroups` di `src/components/layout/Sidebar.tsx`:
    - `navigationGroups[0].groupName === 'OPERASIONAL'`
    - `navigationGroups[1].groupName === 'TOKO RETAIL & INVENTORI'`
    - `navigationGroups[2].groupName === 'SIMPAN PINJAM (KSP / USP)'`
  </verify>
  <done>
    Kelompok menu "TOKO RETAIL & INVENTORI" beserta 7 submenunya berhasil diposisikan tepat di atas kelompok "SIMPAN PINJAM (KSP / USP)".
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Kelompok "TOKO RETAIL & INVENTORI" berada tepat di bawah "OPERASIONAL" dan di atas "SIMPAN PINJAM (KSP / USP)".
- [ ] Seluruh 7 submenu retail & inventori lengkap dengan icon dan route yang tidak berubah.
- [ ] Tidak ada duplikasi atau menu yang hilang.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regression in sidebar navigation
