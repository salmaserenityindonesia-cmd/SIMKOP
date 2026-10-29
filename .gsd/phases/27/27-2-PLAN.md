---
phase: 27
plan: 2
wave: 2
gap_closure: false
---

# Plan 27.2: Wave 2 - Connect Button Handler & Toast Feedback in Laporan Retail Page

## Objective
Menghubungkan tombol "Cetak PDF" pada halaman Laporan Retail (`src/pages/admin/laporan-retail/index.tsx`) dengan fungsi generator `exportRetailReportToPdf`, meneruskan data transaksi dan profil koperasi yang sedang aktif, serta memberikan notifikasi toast feedback saat berkas PDF berhasil diunduh.

## Context
Load these files for context:
- src/pages/admin/laporan-retail/index.tsx
- src/utils/retailExporter.ts
- src/context/FeedbackContext.tsx

## Tasks

<task type="auto">
  <name>Bind Action Button in Laporan Retail Page</name>
  <files>
    src/pages/admin/laporan-retail/index.tsx
  </files>
  <action>
    Modifikasi `src/pages/admin/laporan-retail/index.tsx`:
    1. Import `exportRetailReportToPdf` dari `../../../utils/retailExporter`.
    2. Import hook `useFeedback` dari `../../../context/FeedbackContext` dan inisialisasi `const { showToast } = useFeedback();`.
    3. Perbarui fungsi `handlePrintPDF`:
       - Cek ketersediaan data transaksi: jika `!eodData || !eodData.transactions || eodData.transactions.length === 0`, tampilkan toast info/warning: `showToast('Tidak ada transaksi pada periode yang dipilih.', 'info')`.
       - Panggil `await exportRetailReportToPdf(eodData, { startDate, endDate }, koperasiProfile)`.
       - Tampilkan toast sukses: `showToast('Laporan penjualan retail berhasil diunduh dalam format PDF.', 'success')`.
       - Tambahkan penanganan `try...catch` untuk menangkap kemungkinan error dan memunculkan toast error jika ekspor gagal.
    4. Pastikan tombol "Cetak PDF" pada halaman header (`onClick={handlePrintPDF}`) memicu fungsi baru ini tanpa memicu `window.print()`.
  </action>
  <verify>
    Klik tombol "Cetak PDF" mengeksekusi `handlePrintPDF`, menghasilkan berkas PDF tabel yang bersih tanpa sidebar atau elemen UI navigasi, dan menampilkan toast notifikasi feedback.
  </verify>
  <done>
    Tombol Cetak PDF terhubung penuh ke generator PDF dan memberikan feedback interaktif.
  </done>
</task>

## Success Criteria
- [ ] Tombol "Cetak PDF" memanggil `exportRetailReportToPdf` bukan `window.print()`.
- [ ] Profil koperasi dan data transaksi dari `eodData` diteruskan secara lengkap.
- [ ] Notifikasi toast muncul saat berkas PDF berhasil digenerate atau jika data kosong.
- [ ] Tampilan antarmuka tidak rusak dan tidak ada kebocoran layout print browser.

