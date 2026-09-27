---
phase: 7
plan: 2
wave: 2
gap_closure: false
---

# Plan 7.2: Export Transaksi dan Pinjaman (Excel & PDF)

## Objective
Menambahkan fitur export data transaksi pada modul Kasir (atau Riwayat Penjualan) dan modul Pinjaman.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/lib/exportUtils.ts
- src/pages/admin/ManajemenPembelian.tsx
- src/pages/admin/ApprovalPinjaman.tsx
- src/pages/admin/DashboardSimpanan.tsx

## Tasks

<task type="auto">
  <name>Add Export to Pinjaman and Simpanan</name>
  <files>
    src/pages/admin/ApprovalPinjaman.tsx
    src/pages/admin/DashboardSimpanan.tsx
  </files>
  <action>
    Steps:
    1. Import `exportToExcel` dan `exportToPDF` dari `src/lib/exportUtils.ts`.
    2. Tambahkan tombol export pada halaman `ApprovalPinjaman.tsx` dan `DashboardSimpanan.tsx` agar admin bisa mencetak daftar pinjaman dan simpanan.
    3. Format data tabel ke bentuk array of arrays (untuk PDF) dan list of objects (untuk Excel) dengan header yang relevan.
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Aplikasi berhasil dibuild dan tombol fungsi dipasang dengan benar.
  </done>
</task>

<task type="auto">
  <name>Add Export to Laporan Transaksi (Restock/Penjualan)</name>
  <files>
    src/pages/admin/ManajemenPembelian.tsx
  </files>
  <action>
    Steps:
    1. Import `exportToExcel` dan `exportToPDF` dari `src/lib/exportUtils.ts`.
    2. Pada halaman `ManajemenPembelian.tsx` atau dashboard relevan, tambahkan opsi untuk export laporan transaksi (history restock atau kasir).
  </action>
  <verify>
    npm run build
  </verify>
  <done>
    Aplikasi berhasil dibuild dan tombol fungsi export berhasil diintegrasikan.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tombol export (Excel/PDF) tersedia di modul Pinjaman dan Riwayat Transaksi.
- [ ] Data yang diexport mencerminkan data aktual di tabel antarmuka.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Build process is successful without type errors.
