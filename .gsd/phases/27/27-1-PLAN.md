---
phase: 27
plan: 1
wave: 1
gap_closure: false
---

# Plan 27.1: Wave 1 - Implement Tabular Retail Report PDF Generator with jsPDF-AutoTable

## Objective
Mengganti implementasi cetak PDF berbasis `window.print()` pada `src/utils/retailExporter.ts` dengan generator PDF tabel mandiri berbasis pustaka `jspdf` dan `jspdf-autotable`. Generator ini akan merender laporan penjualan retail dalam orientasi landscape A4 dengan header identitas koperasi, kartu ringkasan rekonsiliasi kas, serta tabel log transaksi lengkap beserta baris total agregasi.

## Context
Load these files for context:
- src/utils/retailExporter.ts
- src/services/retail-report.service.ts
- src/services/settingsService.ts
- src/lib/exportUtils.ts

## Tasks

<task type="auto">
  <name>Build Tabular Retail Report PDF in retailExporter.ts</name>
  <files>
    src/utils/retailExporter.ts
  </files>
  <action>
    Modifikasi `src/utils/retailExporter.ts`:
    1. Import `jsPDF` dari 'jspdf' dan `autoTable` dari 'jspdf-autotable'.
    2. Import interface `KoperasiProfile` dari `../services/settingsService`.
    3. Buat dan ekspor fungsi baru `exportRetailReportToPdf`:
       ```ts
       export async function exportRetailReportToPdf(
         eod: EndOfDayReport | null,
         dateRange: { startDate: string; endDate: string },
         koperasiProfile?: KoperasiProfile | null
       ): Promise<void>
       ```
    4. Rincian implementasi PDF:
       - Dokumen jsPDF: `const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });`
       - Header Koperasi:
         * Nama Koperasi: `(koperasiProfile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase()` (Bold, pt 13).
         * Alamat & Kontak Koperasi jika tersedia (pt 8-9).
         * Judul Laporan: "LAPORAN PENJUALAN RETAIL & KASIR" (Bold, pt 12).
         * Periode: `Periode: ${dateRange.startDate} s/d ${dateRange.endDate}`.
         * Garis pemisah / divider horizontal.
       - Kartu Ringkasan Rekonsiliasi (Summary Cards / Metrics):
         * Tampilkan box atau baris metrik: Total Omzet, Uang Tunai (paid_cash), Potong Simpanan (paid_deposit), dan Bon Toko / Piutang (paid_credit).
       - Tabel Log Transaksi Penjualan (`autoTable`):
         * Head: `[['WAKTU', 'NO. NOTA', 'KASIR', 'PEMBELI', 'TOTAL', 'TUNAI', 'SIMPANAN', 'BON TOKO']]`
         * Body: Mapping dari `eod.transactions`:
           - Waktu: `t.completed_at || t.created_at || '-'`
           - No. Nota: `t.sale_number || '-'`
           - Kasir: `t.pengelola?.nama || '-'`
           - Pembeli: `t.anggota?.nama || 'Non-Anggota'`
           - Total: `formatRp(t.total_amount || 0)`
           - Tunai: `formatRp(t.paid_cash || 0)`
           - Simpanan: `formatRp(t.paid_deposit || 0)`
           - Bon Toko: `formatRp(t.paid_credit || 0)`
         * Foot: Baris 'TOTAL REKONSILIASI' dengan agregasi nilai total_amount, paid_cash, paid_deposit, dan paid_credit:
           `[['TOTAL REKONSILIASI', '', '', '', formatRp(totalAmount), formatRp(totalCash), formatRp(totalDeposit), formatRp(totalCredit)]]`
         * Styling:
           - Theme: `'striped'` atau `'grid'`
           - Head styling: latar emerald gelap `[13, 148, 136]`, text putih, bold, font size 8.5.
           - Body styling: font size 8.
           - Foot styling: latar abu-abu/slate `[241, 245, 249]`, teks tebal `[15, 23, 42]`, font size 8.5.
           - Kolom nominal (indeks 4, 5, 6, 7): `halign: 'right'`.
       - Footer Dokumen:
         * Waktu cetak `Dicetak pada: ${new Date().toLocaleString('id-ID')}` dan nomor halaman otomatis.
       - Penyimpanan Berkas:
         * Unduh berkas dengan nama: `doc.save(`laporan-retail-${dateRange.startDate}-sd-${dateRange.endDate}.pdf`);`
    5. Pertahankan fungsi `printRetailPDF` untuk backward-compatibility jika ada komponen lain yang memanggilnya.
  </action>
  <verify>
    Fungsi `exportRetailReportToPdf` terdefinisi dan terekspor dengan benar di `src/utils/retailExporter.ts` tanpa error TypeScript.
  </verify>
  <done>
    Fungsi pembuatan PDF tabular dengan jsPDF dan jsPDF-AutoTable siap digunakan.
  </done>
</task>

## Success Criteria
- [ ] `exportRetailReportToPdf` diimplementasikan dengan `jspdf` dan `jspdf-autotable`.
- [ ] Dokumen PDF berorientasi landscape A4 dengan branding nama/alamat koperasi.
- [ ] Ringkasan omzet dan log transaksi dimapping ke tabel autoTable lengkap dengan baris agregasi footer.
- [ ] Berkas tersimpan otomatis ke unduhan pengguna.

