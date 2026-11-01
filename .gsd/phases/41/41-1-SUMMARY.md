# Plan 41.1 Summary: Refactor Kolom Aksi Tabel Anggota (Hapus Delete & Tambah Tombol Detail Migrasi)

## Objective
Menghapus tombol aksi Hapus (Delete / Trash) pada setiap baris tabel anggota untuk menjaga keutuhan relasi data (Foreign Key dan integritas keuangan simpan pinjam), serta menambahkan tombol baru "Detail Migrasi Awal" (ikon `Eye`) di samping tombol Edit.

## Changes Made
1. **`src/pages/admin/ManajemenAnggota.tsx`**:
   - Menghapus import `deleteAnggota` dan ikon `Trash2`.
   - Mengimpor ikon `Eye` dari `lucide-react`.
   - Menghapus handler `handleDelete` dan menghapus `showConfirm` yang tidak lagi digunakan.
   - Menyiapkan state dan handler `selectedMigrationMember`, `isMigrationDetailOpen`, dan `handleOpenMigrationDetail` untuk integrasi modal detail migrasi awal.
   - Menyesuaikan header kolom tabel `<th>Aksi</th>` dengan styling lebar rapi (`text-center w-28`) dan menyesuaikan `colSpan={7}` untuk loading/error/empty rows.
   - Mengganti tombol merah `Trash2` pada `<td>` aksi dengan tombol ikon `Eye` bertuliskan title tooltip `"Lihat Detail Data Migrasi Awal"`, berdampingan dengan tombol `Edit2`.

## Verification
- `npm run build`: Berhasil tanpa error TypeScript maupun bundling.
- `npm test`: 23 test suites (227 tests) lulus 100%.
- Kode aksi pada tabel anggota sekarang bebas dari operasi destruktif delete dan siap memicu modal detail migrasi awal.
