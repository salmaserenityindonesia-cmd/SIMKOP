---
phase: 41
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 41.1: Refactor Kolom Aksi Tabel Anggota (Hapus Delete & Tambah Tombol Detail Migrasi)

## Objective
Menghapus tombol aksi Hapus (Delete / Trash) pada setiap baris tabel anggota untuk menjaga keutuhan relasi data (Foreign Key dan integritas keuangan simpan pinjam), serta menambahkan tombol baru "Detail Migrasi Awal" (ikon `Eye` / `FileText`) di samping tombol Edit.

## Context
- `src/pages/admin/ManajemenAnggota.tsx` (tabel daftar anggota dan handler aksi)

## Tasks

<task type="auto">
  <name>Remove Delete Action and Add Migration Detail Button</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenAnggota.tsx`:
       - Import ikon `Eye` dari `lucide-react`. Hapus `Trash2` jika tidak digunakan lagi di komponen ini.
       - Pada kolom header tabel `<th>Aksi</th>`, pastikan lebarnya pas dan rapi (`w-28 text-center`).
       - Pada sel kolom aksi `<td>` di baris data anggota:
         * Hapus tombol merah `Trash2` (dan referensi `handleDelete` dari tampilan).
         * Sisipkan tombol `Eye` untuk membuka modal detail migrasi awal:
           ```tsx
           <div className="flex justify-center items-center space-x-1.5">
             <button
               onClick={() => handleOpenMigrationDetail(anggota)}
               className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
               title="Lihat Detail Data Migrasi Awal"
             >
               <Eye className="w-4 h-4" />
             </button>
             <button
               onClick={() => handleOpenEditModal(anggota)}
               className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
               title="Edit Data Anggota"
             >
               <Edit2 className="w-4 h-4" />
             </button>
           </div>
           ```
  </action>
  <verify>
    Periksa tampilan halaman Manajemen Anggota di browser:
    - Tidak ada lagi tombol tempat sampah merah pada baris anggota.
    - Tersedia tombol ikon mata (Eye) dan tombol pensil (Edit).
  </verify>
  <done>Kolom aksi aman dari penghapusan data dan memiliki trigger detail migrasi.</done>
</task>
