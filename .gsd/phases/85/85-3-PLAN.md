---
phase: 85
plan: 3
wave: 3
gap_closure: false
---

# Plan 85.3: UI Tab in /admin/penarikan-simpanan & Type-to-Confirm Modal

## Objective
Menyediakan antarmuka terpadu di halaman Penarikan Simpanan (`/admin/penarikan-simpanan`) dengan menambahkan sistem tab: Tab 1 untuk "Penarikan Perorangan (Reguler)" dan Tab 2 untuk "Pencairan Massal Simpanan Lebaran" yang dilengkapi banner status siklus terakhir, ringkasan kartu metrik, tabel nominatif penerima, riwayat siklus, serta modal konfirmasi kritis dengan kewajiban mengetik kata `CAIRKAN LEBARAN`.

## Context
Load these files for context:
- src/pages/admin/penarikan-simpanan/index.tsx
- src/services/bulkWithdrawalService.ts

## Tasks

<task type="auto">
  <name>Build Bulk Disbursement Tab & Approval Type-to-Confirm Modal</name>
  <files>src/pages/admin/penarikan-simpanan/index.tsx, src/pages/admin/penarikan-simpanan/BulkLebaranTab.tsx, src/pages/admin/penarikan-simpanan/BulkDisbursementConfirmModal.tsx</files>
  <action>
    - Buat komponen modal konfirmasi `src/pages/admin/penarikan-simpanan/BulkDisbursementConfirmModal.tsx`:
      1. Tampilkan peringatan kritis berwarna merah/amber: "Tindakan ini akan mencairkan 100% saldo simpanan lebaran untuk seluruh anggota aktif dan mereset saldo menjadi Rp 0."
      2. Tampilkan ringkasan eksekusi:
         - Nama Siklus (e.g. "Pencairan THR Idul Fitri 2026")
         - Tanggal Cut-off
         - Total Penerima (jumlah anggota)
         - Total Dana Dicairkan (format Rupiah)
      3. Input verifikasi teks:
         - Wajib mengetik kata: **`CAIRKAN LEBARAN`** secara presisi sebelum tombol eksekusi aktif.
         - Tombol "Konfirmasi & Eksekusi Sekarang" disabled jika teks belum cocok.
      4. Tampilkan status progress/loading saat mutasi batch sedang diproses.
    - Buat komponen tab pencairan massal `src/pages/admin/penarikan-simpanan/BulkLebaranTab.tsx`:
      1. Tampilkan banner informasi status siklus terakhir (`getLastCompletedLebaranCycle`):
         - Jika ada: "Siklus Terakhir Dicairkan: [Tanggal Cut-off] ([Nama Siklus]) - Total Rp [X] ([Y] Anggota)".
         - Jika belum pernah: "Belum ada riwayat siklus pencairan massal simpanan lebaran sebelumnya."
      2. Kartu Metrik Ringkasan Simulasi:
         - Total Anggota Penerima
         - Total Akumulasi Dana Lebaran Siap Cair (Rp)
         - Rata-rata Tabungan per Anggota (Rp)
      3. Filter pencarian anggota & toggle filter (misal hanya anggota yang memiliki saldo > 0).
      4. Tabel Daftar Nominatif Pencairan:
         - Kolom: No, NRP, Nama, Bank & No. Rekening, Saldo Dicairkan (100%), Saldo Setelah Cair (Rp 0), Catatan Pinjaman (ada badge jika memiliki pinjaman aktif).
      5. Tombol aksi:
         - "Refresh Simulasi"
         - "Eksekusi Pencairan Massal" (membuka `BulkDisbursementConfirmModal`).
         - "Ekspor Daftar Nominatif" (CSV/Excel).
      6. Tabel Riwayat Siklus Pencairan Massal:
         - Kolom: Tanggal Siklus, Nama Siklus, Jumlah Anggota, Total Dana, Status (Badge Hijau/Kuning/Merah), Aksi.
    - Perbarui `src/pages/admin/penarikan-simpanan/index.tsx`:
      1. Tambahkan state tab aktif: `'regular' | 'bulk_lebaran'`.
      2. Buat tab switcher navigasi modern di bawah judul halaman:
         - Tab 1: **"Penarikan Perorangan (Reguler)"** (tampilan form pencarian dan penarikan perorangan yang sudah ada).
         - Tab 2: **"Pencairan Massal Simpanan Lebaran"** (menampilkan `BulkLebaranTab`).
      3. Pastikan tidak ada regresi pada fungsionalitas penarikan reguler dan modal kwitansi perorangan.
  </action>
  <verify>
    Pastikan komponen ter-render dengan rapi, tombol konfirmasi terkunci hingga frasa "CAIRKAN LEBARAN" diketik, dan tab navigation dapat berganti mulus tanpa error konsol.
  </verify>
  <done>
    Antarmuka tab Pencairan Massal Simpanan Lebaran beserta modal konfirmasi kritis telah terintegrasi di `/admin/penarikan-simpanan`.
  </done>
</task>

## Must-Haves
- [ ] Tab navigasi antara penarikan perorangan dan pencairan massal lebaran.
- [ ] Kartu ringkasan metrik dan banner siklus terakhir.
- [ ] Tabel nominatif penerima pencairan lengkap dengan info bank dan status pinjaman aktif.
- [ ] Modal konfirmasi kritis yang mewajibkan input teks konfirmasi "CAIRKAN LEBARAN".
- [ ] Riwayat siklus pencairan masa lalu tetap dapat dilihat oleh admin.

## Success Criteria
- [ ] Halaman `/admin/penarikan-simpanan` menyajikan kedua tab secara terpisah dan bersih.
- [ ] Form penarikan perorangan tidak terganggu (zero-regression).

