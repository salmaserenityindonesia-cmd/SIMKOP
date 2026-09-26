# Product Requirement Document (PRD) & System Brief
## SIM Koperasi (SIMKOP) — Sistem Manajemen Simpan Pinjam, Akuntansi & Penjualan Terpadu

---

### 1. Executive Summary & Visi Produk
**SIM Koperasi (SIMKOP)** adalah platform piranti lunak operasional enterprise berbasis web & multi-platform (Desktop PC Kasir, Tablet Operasional, Smartphone Lapangan) yang dirancang untuk mendigitalkan seluruh ekosistem koperasi di Indonesia secara akuntabel, transparan, dan sesuai standar kepatuhan regulasi Kementerian Koperasi & UKM serta standar akuntansi keuangan koperasi (SAK-ETAP/SAK-EP).

Sistem memadukan tiga fungsi pilar utama:
1. **Unit Simpan Pinjam (KSP / USP):** Manajemen simpanan pokok/wajib/sukarela, pengajuan kredit, komite pinjaman, kalkulasi bunga (flat/anuitas/efektif), dan monitoring kolektibilitas angsuran (NPL).
2. **Unit Usaha Pertokoan / Retail (POS Kasir):** Point of sale terintegrasi barcode scanner, manajemen multi-gudang, kartu stok FIFO/rata-rata, dan penjualan tunai/kredit anggota.
3. **Akuntansi & Keuangan Terpusat:** Buku besar otomatis (auto-journaling dari POS & Simpan Pinjam), neraca saldo, laporan laba rugi, dan kalkulasi Sisa Hasil Usaha (SHU) tahunan secara otomatis dan transparan.

---

### 2. Tujuan & Target Metrik (OKRs)
* **Efisiensi Waktu Transaksi Kasir & Teller:** Mengurangi durasi pelayanan teller & kasir menjadi < 45 detik per transaksi.
* **Keandalan Pelaporan Buku & SHU:** Rekonsiliasi kas dan jurnal otomatis 100% tanpa selisih di akhir hari (End of Day balance).
* **Adopsi Multi-Platform:** 100% responsif pada perangkat PC Desktop, Tablet 10", dan Smartphone Android dengan latensi respon UI < 300ms.
* **Keamanan & Kepatuhan Audit:** Standar enkripsi SSL 256-bit, role-based audit trail immutable untuk tiap posting jurnal finansial.

---

### 3. Arsitektur Peran Pengguna (User Persona & Roles)
1. **Pengurus / Ketua Koperasi:**
   - Hak Akses: Dashboard eksekutif, persetujuan pinjaman plafon tinggi, laporan keuangan komprehensif, monitoring SHU real-time.
2. **Pengawas Koperasi:**
   - Hak Akses: Monitoring audit trail, audit kepatuhan kas, verifikasi keabsahan dokumen jaminan dan buku besar.
3. **Teller / Operator Simpan Pinjam:**
   - Hak Akses: Penyetoran simpanan, penarikan kas, verifikasi pengajuan pinjaman, cetak mutasi buku tabungan.
4. **Kasir Unit Toko (Point of Sale):**
   - Hak Akses: Antarmuka kasir cepat (keyboard-first & touch barcode), input belanja anggota (potong gaji/simpanan), retur barang, cetak struk thermal.
5. **Manajer Logistik / Inventaris:**
   - Hak Akses: Purchase Order (PO), penerimaan barang, stok opname berkala, peringatan minimum stok.
6. **Anggota Koperasi:**
   - Hak Akses: Portal mandiri melihat saldo tabungan, histori angsuran, estimasi dividen SHU, dan pengajuan pinjaman online.

---

### 4. Lingkup Fitur Produk (Core Modules)

#### Modul 1: Autentikasi, Keamanan & Registrasi (Telah Diimplementasikan)
* **Multi-Factor Login:** Login berbasis Email atau Nomor Identitas Pegawai (NIP/ID), toggle visibility kata sandi, dan proteksi brute-force.
* **State Interaktif:** Indikator koneksi SSL 256-bit, simulasi validasi input, status sistem aktif, dan error notification bar.
* **Alur Registrasi Pegawai/Anggota:** Pendaftaran berjenjang dengan pemilihan role tugas (Kasir POS, Teller KSP, Pengurus), verifikasi NIP/NIK, dan persetujuan kepatuhan AD/ART.

#### Modul 2: Unit Simpan Pinjam (KSP / USP)
* Pendaftaran rekening simpanan (Simpanan Pokok, Simpanan Wajib, Deposito/Simpanan Berjangka).
* Simulasi & Kalkulator Kredit (Metode Flat, Efektif, Anuitas).
* Workflow Persetujuan Pinjaman (Scoring kelayakan, upload jaminan/agunan, checklist komite kredit).
* Manajemen Jadwal Angsuran & Peringatan Otomatis Jatuh Tempo.

#### Modul 3: Unit Toko Retail & Point of Sale (POS)
* Antarmuka kasir layar sentuh & shortcut keyboard numerik.
* Dukungan pemindaian barcode fisik dan integrasi QRIS Dinamis.
* Sistem pembayaran ganda: Tunai, Transfer Bank, Potong Simpanan Sukarela, atau Skema Bon/Hutang Anggota.
* Pengingat kadaluwarsa produk dan kartu stok real-time.

#### Modul 4: Akuntansi & Pelaporan Keuangan Otomatis
* Auto-Posting Jurnal: Setiap transaksi kasir atau teller langsung membukukan debit/kredit sesuai Chart of Accounts (CoA).
* Laporan Neraca (Balance Sheet), Laporan Arus Kas (Cash Flow), dan Laporan Perhitungan Hasil Usaha (PHU).
* Kalkulasi Pembagian SHU (Jasa Modal & Jasa Anggota) berdasarkan rumus AD/ART koperasi.

---

### 5. Design System & Spesifikasi UI/UX

* **Design Foundation:** `SIMKOP Design System`
  - **Font Utama:** `IBM Plex Serif` (Heading & Angka Finansial berbobot institusional) & `Inter / System Sans` (Clean legibility untuk form & label data).
  - **Warna Primer:** Deep Navy (`#0F2942`) — mencerminkan stabilitas, otoritas, dan integritas finansial.
  - **Warna Aksen:** Emerald / Teal (`#0D9488` / `#10B981`) — mencerminkan pertumbuhan ekonomi dan kesejahteraan anggota.
  - **Latar Belakang:** Neutral Off-White (`#F8F9FF`) dengan pola grid mikroskopis (*subtle dot-matrix*).
  - **Komponen Border & Radius:** `rounded-lg` (8px–12px) dengan batas halus (`border-slate-200`) dan *diffused box shadow*.

* **Prinsip Ergonomi Perangkat:**
  - **Desktop / Laptop Kasir:** Mengutamakan densitas informasi proporsional, pintasan keyboard (*tab order* navigasi tanpa mouse), dan visibilitas kontras tinggi.
  - **Tablet Touchscreen:** Area sentuh (*touch target*) minimal 44x44px untuk operasional jemari operator stan pameran/kantor kas pembantu.
  - **Mobile:** Single-column layout terpusat yang ramah genggaman satu tangan (*thumb-zone navigation*).

---

### 6. Roadmap Pengembangan & Fase Rilis
* **Fase 1 (MVP — Saat ini):** Otentikasi Terpadu, Desain Sistem, Registrasi Multi-Role & Portal Masuk Terenkripsi.
* **Fase 2:** Dashboard Ringkasan Eksekutif, Modul Manajemen Anggota & Buku Simpanan Pokok/Wajib.
* **Fase 3:** Antarmuka POS Kasir Unit Toko, Manajemen Stok Gudang, dan Transaksi Penjualan.
* **Fase 4:** Engine Akuntansi Otomatis, Simulasi Pinjaman & Modul Pembagian SHU Tahunan.
* **Fase 5:** Portal Mandiri Anggota (Mobile App Web View) & Integrasi Payment Gateway Bank.
