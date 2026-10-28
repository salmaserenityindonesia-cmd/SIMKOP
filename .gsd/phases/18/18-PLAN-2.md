---
phase: 18
plan: 2
wave: 2
gap_closure: false
depends_on:
  - 18.1
---

# Plan 18.2: Refactor Native Browser Dialogs in Admin Module Pages

## Objective
Mengganti seluruh pemanggilan `window.alert(...)`, `alert(...)`, dan `window.confirm(...)` di halaman-halaman modul Admin dengan hook `useFeedback()` (`showToast`, `showAlert`, dan `showConfirm`).

## Context
Load these files for context:
- .gsd/SPEC.md
- src/context/FeedbackContext.tsx
- src/pages/admin/AdminDashboard.tsx
- src/pages/admin/ApprovalPinjaman.tsx
- src/pages/admin/BatchUpdater.tsx
- src/pages/admin/DashboardSimpanan.tsx
- src/pages/admin/DetailPinjaman.tsx
- src/pages/admin/Kasir.tsx
- src/pages/admin/ManajemenAnggota.tsx
- src/pages/admin/ManajemenKategori.tsx
- src/pages/admin/ManajemenPembelian.tsx
- src/pages/admin/ManajemenProduk.tsx
- src/pages/admin/ManajemenProdukSimpanPinjam.tsx
- src/pages/admin/SalaryImport.tsx
- src/pages/admin/TerimaSetoran.tsx
- src/pages/admin/UserManagement.tsx
- src/pages/admin/laporan-keuangan/index.tsx

## Tasks

<task type="auto">
  <name>Refactor Dialogs in Admin Operational & Master Data Pages</name>
  <files>
    src/pages/admin/ManajemenAnggota.tsx
    src/pages/admin/ManajemenKategori.tsx
    src/pages/admin/ManajemenProduk.tsx
    src/pages/admin/ManajemenPembelian.tsx
    src/pages/admin/UserManagement.tsx
  </files>
  <action>
    1. Import `useFeedback` di masing-masing file:
       - `ManajemenAnggota.tsx`: Ganti konfirmasi hapus anggota dengan `await showConfirm(...)`, ganti pesan error/sukses simpan & migrasi Excel dengan `showToast(msg, 'error' | 'success')`.
       - `ManajemenKategori.tsx`: Ganti `confirm(...)` hapus dengan `await showConfirm(...)`, ganti pesan import/simpan dengan `showToast`.
       - `ManajemenProduk.tsx`: Ganti `confirm(...)` hapus produk dengan `await showConfirm(...)`, ganti pesan import/simpan dengan `showToast`.
       - `ManajemenPembelian.tsx`: Ganti alert validasi faktur dan barang dengan `showToast(msg, 'warning')` / `showToast(msg, 'error')`.
       - `UserManagement.tsx`: Ganti `window.confirm` hapus user dan ubah role dengan `await showConfirm(...)`, ganti pesan kesalahan service key dengan `showToast(msg, 'error')`.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Semua dialog native pada 5 file master data telah bermigrasi ke `useFeedback` tanpa type error.
  </done>
</task>

<task type="auto">
  <name>Refactor Dialogs in Savings, Loans, Cashflow & Batch Admin Pages</name>
  <files>
    src/pages/admin/AdminDashboard.tsx
    src/pages/admin/ApprovalPinjaman.tsx
    src/pages/admin/BatchUpdater.tsx
    src/pages/admin/DashboardSimpanan.tsx
    src/pages/admin/DetailPinjaman.tsx
    src/pages/admin/Kasir.tsx
    src/pages/admin/ManajemenProdukSimpanPinjam.tsx
    src/pages/admin/SalaryImport.tsx
    src/pages/admin/TerimaSetoran.tsx
    src/pages/admin/laporan-keuangan/index.tsx
  </files>
  <action>
    1. Import `useFeedback` di setiap file:
       - `AdminDashboard.tsx`: Ganti backup database konfirmasi dan alert sukses/gagal dengan `await showConfirm(...)` dan `showToast(...)`.
       - `ApprovalPinjaman.tsx`: Ganti konfirmasi persetujuan/penolakan pinjaman dengan `await showConfirm(...)` dan toast error.
       - `BatchUpdater.tsx`: Ganti konfirmasi batal dengan `await showConfirm(...)`.
       - `DashboardSimpanan.tsx` & `DetailPinjaman.tsx`: Ganti alert nominal dan notifikasi simpan dengan `showToast(...)`.
       - `Kasir.tsx`: Ganti konfirmasi replace keranjang dari saved cart dan alert bayar dengan `await showConfirm(...)` dan `showToast(...)`.
       - `ManajemenProdukSimpanPinjam.tsx`: Ganti konfirmasi hapus jenis simpanan/pinjaman dengan `await showConfirm(...)`.
       - `SalaryImport.tsx`: Ganti konfirmasi batal impor dengan `await showConfirm(...)`.
       - `TerimaSetoran.tsx`: Ganti konfirmasi proses pembayaran dan alert hasil dengan `await showConfirm(...)` dan `showToast(...)`.
       - `laporan-keuangan/index.tsx`: Ganti alert gagal export Excel dengan `showToast(..., 'error')`.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Semua dialog browser native di seluruh halaman admin telah digantikan oleh `useFeedback`.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Tidak ada lagi pemanggilan `alert(` atau `confirm(` di dalam direktori `src/pages/admin/`.
- [ ] Alur asinkron (misal: user klik Batal pada modal konfirmasi hapus anggota) membatalkan aksi dengan benar.

## Success Criteria
- [ ] Semua file admin berhasil diupdate
- [ ] Typecheck lulus tanpa error

