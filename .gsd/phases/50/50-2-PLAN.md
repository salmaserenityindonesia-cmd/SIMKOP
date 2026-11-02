---
phase: 50
plan: 2
wave: 2
depends_on: ["50-1"]
gap_closure: false
---

# Plan 50.2: UI Form Pengaturan Tarif Simpanan Bertingkat di Pengaturan Koperasi

## Objective
Menambahkan kartu form manajemen tarif iuran simpanan bertingkat mandiri pada menu Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`) agar pengurus koperasi dapat memantau riwayat kenaikan tarif dan menambahkan tarif baru (dengan validasi rentang tanggal otomatis) tanpa perlu mengubah kode sumber atau akses database langsung.

## Context
- `src/pages/admin/PengaturanKoperasi.tsx`
- `src/services/savingsRateService.ts`
- `src/pages/admin/PengaturanKoperasi.test.tsx`
- `src/components/layout/AdminLayout.tsx`

## Tasks

<task type="auto">
  <name>Add Savings Rate Tiers Management Card & Add Modal in PengaturanKoperasi.tsx</name>
  <files>
    src/pages/admin/PengaturanKoperasi.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/PengaturanKoperasi.tsx`.
    2. Impor modul `savingsRateService` (`getRateTiers`, `addRateTier`, `deleteRateTier`, `SavingsRateTier`).
    3. Tambahkan state untuk daftar tier (`rateTiers`), loading status, dan modal state untuk "Tambah Tarif Baru".
    4. Tambahkan kartu form **"Konfigurasi Tarif Iuran Simpanan Bertingkat"** di bawah / di samping form profil koperasi:
       - Header kartu dengan ikon yang serasi (misal `Layers` atau `TrendingUp`), judul jelas, dan tombol **"+ Tambah Kenaikan Tarif"**.
       - Tabel ringkasan tarif berjenjang:
         * Kolom: Jenis Simpanan (badge warna: Wajib = Biru/Emerald, Belanja = Violet/Amber, Lebaran = Rose/Orange), Rentang Periode (contoh: "Januari 2024 - Oktober 2025" atau "November 2025 - Seterusnya"), Nominal Bulanan (Rp terformat), Catatan/No. SK, Status ("Aktif" atau "Riwayat"), dan Tombol Hapus (dengan konfirmasi).
       - Modal / Dialog Form **"Tambah Kenaikan Tarif Simpanan"**:
         * Pilihan Jenis Simpanan: Simpanan Wajib (`WAJIB`), Simpanan Belanja (`BELANJA`), Simpanan Lebaran (`LEBARAN`).
         * Pemilih Periode Mulai: Dropdown Bulan (Januari - Desember) dan Input Tahun Mulai.
         * Checkbox opsi "Berlaku Seterusnya" (default: true). Jika tidak dicentang, munculkan pemilih Periode Akhir (Bulan & Tahun).
         * Input Nominal Iuran Bulanan Baru (Rp).
         * Input Catatan / Dasar Keputusan (contoh: "Hasil Rapat Anggota Tahunan 2025").
         * Tombol Simpan memanggil `savingsRateService.addRateTier` dan menampilkan feedback toast sukses lalu merefresh daftar tarif.
  </action>
  <verify>
    Periksa komponen `PengaturanKoperasi.tsx` dapat dikompilasi tanpa error TypeScript dan menyertakan kartu konfigurasi tarif simpanan bertingkat.
  </verify>
  <done>
    Pengurus koperasi dapat melihat dan menambah konfigurasi tarif berjenjang langsung di `/admin/pengaturan`.
  </done>
</task>

<task type="auto">
  <name>Create Component Tests for Rate Tier Configuration in PengaturanKoperasi.test.tsx</name>
  <files>
    src/pages/admin/PengaturanKoperasi.test.tsx
  </files>
  <action>
    1. Buat berkas pengujian `src/pages/admin/PengaturanKoperasi.test.tsx`.
    2. Mock dependensi terkait:
       - `savingsRateService`: `getRateTiers`, `addRateTier`, `deleteRateTier`.
       - `settingsService`: `getKoperasiProfile`, `updateKoperasiProfile`, `isTableMigratedInSupabase`.
       - `AdminLayout` dan `FeedbackContext`.
    3. Tulis pengujian:
       - Memastikan kartu "Konfigurasi Tarif Iuran Simpanan Bertingkat" ter-render di layar.
       - Memastikan daftar tarif historis dan aktif ditampilkan dengan benar pada tabel.
       - Memastikan tombol "+ Tambah Kenaikan Tarif" membuka modal dialog input kenaikan tarif.
       - Memastikan submit penambahan tarif memanggil `addRateTier` dengan parameter yang tepat.
  </action>
  <verify>
    Jalankan test: `npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx`.
  </verify>
  <done>
    Seluruh pengujian komponen `PengaturanKoperasi.test.tsx` berhasil dan lulus 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Kartu "Konfigurasi Tarif Iuran Simpanan Bertingkat" tampil pada halaman `/admin/pengaturan`.
- [ ] Pengurus dapat menambahkan tarif baru dengan pilihan simpanan, rentang waktu mulai, dan nominal bulanan.
- [ ] Tombol hapus tarif berfungsi dengan konfirmasi aman.
- [ ] Test `PengaturanKoperasi.test.tsx` lulus 100%.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Form pengaturan tarif responsif dan ramah pengguna
- [ ] No regressions in tests
