---
phase: 23
plan: 1
wave: 1
gap_closure: false
---

# Plan 23.1: Relokasi Menu Laporan Retail & Stok ke Kelompok Toko Retail & Inventori

## Objective
Memindahkan item navigasi menu "Laporan Retail & Stok" (`/admin/laporan-retail`) dari kelompok "LAPORAN & ANALITIK" ke kelompok "TOKO RETAIL & INVENTORI" (tepat di bawah "Pengaturan Kasir") pada file `src/components/layout/Sidebar.tsx` untuk meningkatkan kohesi alur kerja operasional kasir dan toko retail.

## Context
Load these files for context:
- src/components/layout/Sidebar.tsx

## Tasks

<task type="auto">
  <name>Relocate Laporan Retail & Stok Navigation Item in Sidebar.tsx</name>
  <files>
    src/components/layout/Sidebar.tsx
  </files>
  <action>
    1. Buka `src/components/layout/Sidebar.tsx`.
    2. Pada array `navigationGroups`:
       - Cari item `{ label: 'Laporan Retail & Stok', icon: TrendingUp, href: '/admin/laporan-retail' }` di bawah `groupName: 'LAPORAN & ANALITIK'`.
       - Hapus item tersebut dari `LAPORAN & ANALITIK`.
       - Pindahkan dan tambahkan ke dalam `groupName: 'TOKO RETAIL & INVENTORI'` tepat setelah item `{ label: 'Pengaturan Kasir', ... }`.
    3. Pertahankan ikon `TrendingUp`, teks label, rute `href: '/admin/laporan-retail'`, dan visibilitasnya.
  </action>
  <verify>
    Periksa bahwa menu "Laporan Retail & Stok" berada dalam kelompok `TOKO RETAIL & INVENTORI` dan tidak ada lagi di `LAPORAN & ANALITIK`.
  </verify>
  <done>
    Struktur navigasi sidebar telah berpindah sesuai spesifikasi.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Item navigasi "Laporan Retail & Stok" berada di kelompok "TOKO RETAIL & INVENTORI" di bawah "Pengaturan Kasir".
- [ ] Kelompok "LAPORAN & ANALITIK" hanya menyisakan "Laporan Keuangan".

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regression in sidebar rendering
