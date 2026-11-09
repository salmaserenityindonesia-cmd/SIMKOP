---
phase: 68
plan: 2
wave: 2
gap_closure: false
depends_on:
  - 68.1
---

# Plan 68.2: UI Dashboard, Receipt Modal, Routing & Navigation Integration

## Objective
Membangun antarmuka pengguna dashboard pengawasan penarikan simpanan pada `src/pages/admin/LaporanPenarikanSimpanan.tsx`, menyajikan kartu KPI real-time (total pencairan, fokus lebaran, rasio transfer, alert pinjaman aktif), filter multi-facet, tabel mutasi pengawasan dengan indikator status kewajiban anggota, modal preview kwitansi/cetak bukti penarikan, tombol ekspor Excel & PDF, pendaftaran navigasi menu di `Sidebar.tsx`, pendaftaran route di `App.tsx`, serta pengujian unit antarmuka.

## Context
Load these files for context:
- `src/services/withdrawalReportService.ts`
- `src/components/layout/Sidebar.tsx`
- `src/App.tsx`
- `src/components/withdrawal/WithdrawalReceiptModal.tsx`
- `src/pages/admin/penarikan-simpanan/index.tsx`
- `src/pages/admin/LaporanMutasiBarang.tsx`

## Tasks

<task type="auto">
  <name>Build LaporanPenarikanSimpanan Page Component</name>
  <files>
    src/pages/admin/LaporanPenarikanSimpanan.tsx
  </files>
  <action>
    Buat antarmuka `src/pages/admin/LaporanPenarikanSimpanan.tsx`:
    1. Header Halaman:
       - Judul: "Laporan Pengawasan & Pencairan Simpanan"
       - Subjudul: "Monitoring real-time arus kas keluar penarikan simpanan sukarela, lebaran, dan kliring keanggotaan."
       - Tombol Aksi:
         * "Ekspor Excel (.xlsx)" dengan icon `Download` / `FileSpreadsheet`.
         * "Cetak Rekap PDF" dengan icon `Printer` / `FileText`.
    2. Kartu KPI Pengawasan (Header Metrics):
       - Total Pencairan Kas Periode Ini (Teks tebal merah/rose dengan nominal Rupiah)
       - Pencairan Simpanan Lebaran (Fokus Musiman dengan badge hijau emerald)
       - Pencairan Non-Tunai / Transfer Bank (Nominal & rasio persentase akuntabilitas)
       - Anggota dengan Pinjaman Aktif (Cross-Obligation Risk Alert dengan badge amber/oranye)
    3. Bilah Filter Komprehensif:
       - Presets Tanggal Cepat: "Semua", "Hari Ini", "Bulan Ini", "Kuartal Ini", "Custom".
       - Input Date Range (Tanggal Mulai & Tanggal Akhir).
       - Filter Dropdown Jenis Simpanan: "Semua Simpanan", "Simpanan Hari Raya (Lebaran)", "Simpanan Belanja", "Simpanan Sukarela", "Pokok & Wajib".
       - Filter Dropdown Metode Pencairan: "Semua Metode", "Tunai Kasir", "Transfer Bank".
       - Toggle Switch / Checkbox Filter Khusus: "Hanya yang Memiliki Pinjaman Aktif" (Cross-Obligation filter).
       - Search Box interaktif (Mencari berdasarkan Nama Anggota, NRP, atau Nomor Kwitansi/Referensi).
    4. Tabel Data Pengawasan:
       - Kolom tabel:
         1. No. & Tanggal/Jam Transaksi
         2. No. Bukti / Kwitansi / Referensi (dapat diklik untuk membuka modal kwitansi)
         3. Identitas Anggota (NRP, Nama Lengkap, Pangkat)
         4. Jenis Simpanan (Badge berwarna sesuai tipe: Hijau Lebaran, Biru Belanja, Slate Pokok/Wajib, Ungu Sukarela)
         5. Nominal Penarikan (Teks tebal merah minus: `- Rp X.XXX.XXX`)
         6. Metode Pencairan (Badge Tunai Kas vs Transfer Bank beserta nomor rekening)
         7. Status Kewajiban Pinjaman (Badge Hijau "Bebas Pinjaman" jika 0, atau Badge Kuning/Amber "Ada Pinjaman Aktif: Sisa Rp X" jika ada)
         8. Catatan & Aksi (Tombol lihat kwitansi cetak)
       - Pagination tabel jika data banyak atau scrollable ledger.
       - Baris Total Ringkasan di bagian bawah tabel.
    5. Modal Bukti Kwitansi / Tanda Terima:
       - Integrasikan modal kwitansi penarikan (atau render ulang tanda terima penarikan) sehingga pengurus dapat mencetak ulang kwitansi penarikan kapan saja.
    6. Cetak PDF & Ekspor Excel:
       - Panggil `exportWithdrawalReportExcel` saat tombol ekspor Excel diklik.
       - Sediakan handler `handlePrintPdf` atau window.print mode stylesheet khusus untuk mencetak ringkasan laporan pencairan.
  </action>
  <verify>
    Jalankan pemeriksaan tipe TypeScript:
    npx tsc --noEmit
  </verify>
  <done>
    Halaman `LaporanPenarikanSimpanan.tsx` berhasil dibuat lengkap dengan KPI cards, filter controls, tabel mutasi, modal kwitansi, dan ekspor.
  </done>
</task>

<task type="auto">
  <name>Register Routing, Sidebar Navigation, and Add Component Tests</name>
  <files>
    src/components/layout/Sidebar.tsx
    src/App.tsx
    src/pages/admin/LaporanPenarikanSimpanan.test.tsx
  </files>
  <action>
    1. Perbarui `src/components/layout/Sidebar.tsx`:
       - Pada grup menu SIMPAN PINJAM (KSP / USP), tepat di bawah menu "Penarikan Simpanan", tambahkan item:
         `{ label: 'Laporan Penarikan', icon: FileSpreadsheet, href: '/admin/laporan-penarikan' }`.
       - Import icon `FileSpreadsheet` dari `lucide-react`.
    2. Perbarui `src/App.tsx`:
       - Daftarkan route baru:
         ```tsx
         import LaporanPenarikanSimpanan from './pages/admin/LaporanPenarikanSimpanan';
         // ...
         <Route
           path="/admin/laporan-penarikan"
           element={
             <ProtectedRoute>
               <LaporanPenarikanSimpanan />
             </ProtectedRoute>
           }
         />
         ```
    3. Buat berkas pengujian antarmuka `src/pages/admin/LaporanPenarikanSimpanan.test.tsx`:
       - Render halaman di dalam MemoryRouter.
       - Mock `withdrawalReportService` (`getWithdrawalDetailedLedger`, `getWithdrawalSummary`, `exportWithdrawalReportExcel`).
       - Uji render elemen utama: judul halaman, kartu KPI, filter controls, data baris tabel penarikan.
       - Uji interaksi filter pencarian dan tombol ekspor.
       - Uji pembukaan modal bukti kwitansi saat klik tombol nomor referensi / detail kwitansi.
    4. Jalankan validasi end-to-end:
       - `npm test`
       - `npm run build`
  </action>
  <verify>
    Jalankan unit test dan production build:
    npx vitest run src/pages/admin/LaporanPenarikanSimpanan.test.tsx
    npm run build
  </verify>
  <done>
    Menu terdaftar di Sidebar, route `/admin/laporan-penarikan` aktif, UI test lulus, dan build produksi sukses 100%.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Route `/admin/laporan-penarikan` dapat diakses dan terlindungi `ProtectedRoute`.
- [ ] Sidebar menampilkan menu "Laporan Penarikan" di kelompok SIMPAN PINJAM.
- [ ] Modal bukti kwitansi dapat dibuka dan dicetak ulang.
- [ ] Seluruh unit test dan build produksi berhasil tanpa error.

## Success Criteria
- [ ] Semua task diverifikasi lulus.
- [ ] Tidak ada regresi pada fungsionalitas lain.
