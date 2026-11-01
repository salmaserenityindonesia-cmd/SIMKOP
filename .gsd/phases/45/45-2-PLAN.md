---
phase: 45
plan: 2
wave: 2
depends_on: ["45.1"]
gap_closure: false
---

# Plan 45.2: Build Excel & PDF Exporters

## Objective
Membangun modul generator dokumen `src/services/memberExporter.ts` yang mengekspor data anggota 14 kolom ke format Excel (`.xlsx`) via `exceljs` dan format PDF Landscape A4 via `jspdf` & `jspdf-autotable`, lengkap dengan header identitas koperasi, penataan kolom profesional, format nominal mata uang, dan baris akumulasi total.

## Context
- `src/services/memberService.ts`
- `src/utils/retailExporter.ts`
- `src/services/settingsService.ts`

## Tasks

<task type="auto">
  <name>Implement exportMembersToExcel and exportMembersToPdf</name>
  <files>
    src/services/memberExporter.ts
  </files>
  <action>
    1. Buat berkas `src/services/memberExporter.ts`.
    2. **Fungsi 1: `exportMembersToExcel(rows: MemberComprehensiveExportRow[], filenamePrefix?: string)`**:
       - Gunakan pustaka `ExcelJS`:
         * Buat workbook dan worksheet `'Data Anggota Lengkap'`.
         * Susun kolom dengan header persis 14 nama field baku:
           `nrp, nama, pangkat, bank_account_number, membership_status, tgl_awal_anggota, jumlah_simpanan_pokok, jumlah_simpanan_wajib, jumlah_simpanan_belanja, jumlah_simpanan_lebaran, jumlah_pinjaman, tgl_awal_pinjaman, tenor, sisa_pinjaman`.
         * Format kolom teks (`nrp`, `nama`, `pangkat`, `bank_account_number`, `membership_status`) dengan format text `@`.
         * Format kolom tanggal (`tgl_awal_anggota`, `tgl_awal_pinjaman`) dengan format `yyyy-mm-dd`.
         * Format kolom nominal (`jumlah_simpanan_*`, `jumlah_pinjaman`, `sisa_pinjaman`) sebagai nilai numerik dengan format angka `#,##0` (sehingga kompatibel jika di-reimport tanpa error parsing).
         * Format header dengan warna tema SIMKOP (latar abu/slate, teks tebal).
         * Simpan berkas dengan nama `laporan-anggota-lengkap-YYYYMMDD.xlsx` menggunakan buffer dan file download trigger.
    3. **Fungsi 2: `exportMembersToPdf(rows: MemberComprehensiveExportRow[], koperasiProfile?: KoperasiProfile | null, autoSave = true)`**:
       - Gunakan `jsPDF` dengan konfigurasi:
         `new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })`.
       - Render Header Dokumen:
         * Nama Koperasi (huruf kapital, font tebal).
         * Alamat & Kontak (telepon/email) dari `koperasiProfile`.
         * Judul Laporan: `"LAPORAN DATA LENGKAP ANGGOTA & SALDO KOPERASI"`.
         * Tanggal Cetak / Waktu Generate.
         * Garis pemisah dokumen.
       - Susun Tabel via `autoTable`:
         * Header 15 kolom (ditambah kolom No untuk kerapian):
           `['No', 'NRP', 'Nama', 'Pkt', 'Rekening', 'Status', 'Tgl Masuk', 'S. Pokok', 'S. Wajib', 'S. Belanja', 'S. Lebaran', 'Jml Pinj', 'Tgl Pinj', 'Tenor', 'Sisa Pinj']`.
         * Styling: `theme: 'striped'`, `fontSize: 7` (atau 6.5) agar tidak terpotong, padding compact (1.5mm).
         * Alignment: Teks rata kiri, No/Status/Tenor/Tgl rata tengah, seluruh nominal simpanan & pinjaman rata kanan dengan format `formatRp()`.
         * Footer Row (Total):
           Tambahkan baris ringkasan total di bawah tabel yang menjumlahkan akumulasi seluruh kolom Simpanan Pokok, Wajib, Belanja, Lebaran, Jumlah Pinjaman, dan Sisa Pinjaman.
       - Simpan dokumen dengan nama `laporan-anggota-lengkap-YYYYMMDD.pdf`.
  </action>
  <verify>
    - Panggilan `exportMembersToExcel` menghasilkan workbook Excel yang dapat dibuka dengan 14 kolom terstruktur.
    - Panggilan `exportMembersToPdf` menghasilkan dokumen PDF landscape rapi, tidak terjadi teks terpotong (overflow), dan baris total terhitung presisi.
  </verify>
  <done>
    Generator Excel dan PDF 14 kolom selesai diimplementasikan.
  </done>
</task>

## Success Criteria
- [ ] File Excel memuat tepat 14 header baku yang identik dengan template migrasi
- [ ] Kolom angka pada Excel berformat numerik murni
- [ ] Dokumen PDF berorientasi landscape A4 dengan header identitas koperasi
- [ ] Tabel PDF memuat baris total kalkulasi simpanan dan pinjaman di bagian bawah
