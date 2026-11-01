import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MemberComprehensiveExportRow } from './memberService';
import type { KoperasiProfile } from './settingsService';

/**
 * Format angka nominal ke format mata uang Rupiah
 */
export const formatRp = (n: number = 0): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/**
 * Mendapatkan string tanggal hari ini dalam format YYYYMMDD
 */
export function getFormattedToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Mengekspor data komprehensif anggota ke format file Excel (.xlsx) dengan 14 kolom baku.
 * Header dan kolom identik dengan skema template migrasi anggota untuk integritas dua arah.
 *
 * @param rows Daftar baris data komprehensif anggota
 * @param filenamePrefix Prefiks opsional untuk nama berkas (default: 'laporan-anggota-lengkap')
 * @param autoSave Apakah otomatis memicu pengunduhan berkas di browser (default: true)
 */
export async function exportMembersToExcel(
  rows: MemberComprehensiveExportRow[],
  filenamePrefix?: string,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP Enterprise';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data Anggota Lengkap');

  // 14 Kolom baku sesuai skema template migrasi anggota
  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 16 },
    { header: 'nama', key: 'nama', width: 28 },
    { header: 'pangkat', key: 'pangkat', width: 18 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 22 },
    { header: 'membership_status', key: 'membership_status', width: 18 },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 16 },
    { header: 'jumlah_simpanan_pokok', key: 'jumlah_simpanan_pokok', width: 22 },
    { header: 'jumlah_simpanan_wajib', key: 'jumlah_simpanan_wajib', width: 22 },
    { header: 'jumlah_simpanan_belanja', key: 'jumlah_simpanan_belanja', width: 22 },
    { header: 'jumlah_simpanan_lebaran', key: 'jumlah_simpanan_lebaran', width: 22 },
    { header: 'jumlah_pinjaman', key: 'jumlah_pinjaman', width: 18 },
    { header: 'tgl_awal_pinjaman', key: 'tgl_awal_pinjaman', width: 18 },
    { header: 'tenor', key: 'tenor', width: 12 },
    { header: 'sisa_pinjaman', key: 'sisa_pinjaman', width: 18 },
  ];

  // Format kolom teks dengan format text '@'
  ['nrp', 'nama', 'pangkat', 'bank_account_number', 'membership_status'].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = '@';
  });

  // Format kolom tanggal dengan format 'yyyy-mm-dd'
  ['tgl_awal_anggota', 'tgl_awal_pinjaman'].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = 'yyyy-mm-dd';
  });

  // Format kolom nominal numerik dengan format angka '#,##0'
  [
    'jumlah_simpanan_pokok',
    'jumlah_simpanan_wajib',
    'jumlah_simpanan_belanja',
    'jumlah_simpanan_lebaran',
    'jumlah_pinjaman',
    'sisa_pinjaman',
  ].forEach((k) => {
    const col = worksheet.getColumn(k);
    if (col) col.numFmt = '#,##0';
  });

  // Format tenor dengan format angka '#,##0'
  const tenorCol = worksheet.getColumn('tenor');
  if (tenorCol) tenorCol.numFmt = '#,##0';

  // Format header baris pertama dengan tema warna SIMKOP (latar abu/slate, teks tebal)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' }, // Slate 700
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Isi data per baris
  rows.forEach((r) => {
    const row = worksheet.addRow({
      nrp: r.nrp || '',
      nama: r.nama || '',
      pangkat: r.pangkat || '',
      bank_account_number: r.bank_account_number || '',
      membership_status: r.membership_status || '',
      tgl_awal_anggota: r.tgl_awal_anggota || '',
      jumlah_simpanan_pokok: Number(r.jumlah_simpanan_pokok) || 0,
      jumlah_simpanan_wajib: Number(r.jumlah_simpanan_wajib) || 0,
      jumlah_simpanan_belanja: Number(r.jumlah_simpanan_belanja) || 0,
      jumlah_simpanan_lebaran: Number(r.jumlah_simpanan_lebaran) || 0,
      jumlah_pinjaman: Number(r.jumlah_pinjaman) || 0,
      tgl_awal_pinjaman: r.tgl_awal_pinjaman || '',
      tenor: Number(r.tenor) || 0,
      sisa_pinjaman: Number(r.sisa_pinjaman) || 0,
    });

    row.height = 20;
    row.font = { name: 'Calibri', size: 9 };

    row.getCell('nrp').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('nama').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('pangkat').alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell('bank_account_number').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('membership_status').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('tgl_awal_anggota').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('jumlah_simpanan_pokok').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_wajib').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_belanja').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_simpanan_lebaran').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('jumlah_pinjaman').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('tgl_awal_pinjaman').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('tenor').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('sisa_pinjaman').alignment = { horizontal: 'right', vertical: 'middle' };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  // Tentukan nama berkas unduhan
  const filename = filenamePrefix
    ? filenamePrefix.endsWith('.xlsx')
      ? filenamePrefix
      : `${filenamePrefix}-${getFormattedToday()}.xlsx`
    : `laporan-anggota-lengkap-${getFormattedToday()}.xlsx`;

  // Trigger unduhan di browser jika autoSave diaktifkan
  if (autoSave && typeof document !== 'undefined') {
    try {
      const buf = await workbook.xlsx.writeBuffer();
      if (typeof URL !== 'undefined' && URL.createObjectURL && typeof Blob !== 'undefined') {
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body?.appendChild?.(a);
        a.click();
        document.body?.removeChild?.(a);
        URL.revokeObjectURL?.(url);
      }
    } catch (err) {
      console.warn('Gagal memicu unduhan Excel di browser:', err);
    }
  }

  return workbook;
}

/**
 * Mengekspor data komprehensif anggota ke format PDF Landscape A4.
 * Dilengkapi kop resmi koperasi, penataan kolom 15 field (termasuk No), dan baris total kalkulasi simpanan & pinjaman.
 *
 * @param rows Daftar baris data komprehensif anggota
 * @param koperasiProfile Profil instansi koperasi
 * @param autoSave Apakah otomatis memicu penyimpanan file PDF (default: true)
 */
export async function exportMembersToPdf(
  rows: MemberComprehensiveExportRow[],
  koperasiProfile?: KoperasiProfile | null,
  autoSave = true
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // 1. Header Identitas Koperasi
  const namaKoperasi = (koperasiProfile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(namaKoperasi, marginX, 14);

  let currentY = 19;
  const contactDetails = [
    koperasiProfile?.alamat,
    koperasiProfile?.telepon ? `Telp: ${koperasiProfile.telepon}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  if (contactDetails) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(contactDetails, marginX, currentY);
    currentY += 5;
  }

  // Judul Laporan & Informasi Tanggal Cetak
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 118, 110); // #0F766E Teal-700
  doc.text('LAPORAN DATA LENGKAP ANGGOTA & SALDO KOPERASI', marginX, currentY + 2);

  const printTimestamp = new Date().toLocaleString('id-ID');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Total Anggota: ${rows.length} | Tanggal Cetak: ${printTimestamp}`, marginX, currentY + 7);

  // Garis pemisah dokumen
  currentY += 10;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);
  currentY += 4;

  // 2. Akumulasi Total untuk Footer Row
  let totalPokok = 0;
  let totalWajib = 0;
  let totalBelanja = 0;
  let totalLebaran = 0;
  let totalPinjaman = 0;
  let totalSisaPinjaman = 0;

  rows.forEach((r) => {
    totalPokok += Number(r.jumlah_simpanan_pokok) || 0;
    totalWajib += Number(r.jumlah_simpanan_wajib) || 0;
    totalBelanja += Number(r.jumlah_simpanan_belanja) || 0;
    totalLebaran += Number(r.jumlah_simpanan_lebaran) || 0;
    totalPinjaman += Number(r.jumlah_pinjaman) || 0;
    totalSisaPinjaman += Number(r.sisa_pinjaman) || 0;
  });

  // 3. Susun Baris Tabel
  const tableRows = rows.map((r, idx) => [
    idx + 1,
    r.nrp || '-',
    r.nama || '-',
    r.pangkat || '-',
    r.bank_account_number || '-',
    r.membership_status || '-',
    r.tgl_awal_anggota || '-',
    formatRp(r.jumlah_simpanan_pokok),
    formatRp(r.jumlah_simpanan_wajib),
    formatRp(r.jumlah_simpanan_belanja),
    formatRp(r.jumlah_simpanan_lebaran),
    formatRp(r.jumlah_pinjaman),
    r.tgl_awal_pinjaman || '-',
    r.tenor > 0 ? `${r.tenor} bln` : '-',
    formatRp(r.sisa_pinjaman),
  ]);

  if (tableRows.length === 0) {
    tableRows.push([
      {
        content: 'Tidak ada data anggota untuk ditampilkan.',
        colSpan: 15,
        styles: { halign: 'center', fontStyle: 'italic' },
      } as any,
    ]);
  }

  // Baris Total di Foot
  const footRows: any[] = [
    [
      {
        content: 'TOTAL',
        colSpan: 7,
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRp(totalPokok),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRp(totalWajib),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRp(totalBelanja),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRp(totalLebaran),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRp(totalPinjaman),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: '-',
        styles: { halign: 'center' as const },
      },
      {
        content: '-',
        styles: { halign: 'center' as const },
      },
      {
        content: formatRp(totalSisaPinjaman),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
    ],
  ];

  // 4. Render Tabel via autoTable
  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'No',
        'NRP',
        'Nama',
        'Pkt',
        'Rekening',
        'Status',
        'Tgl Masuk',
        'S. Pokok',
        'S. Wajib',
        'S. Belanja',
        'S. Lebaran',
        'Jml Pinj',
        'Tgl Pinj',
        'Tenor',
        'Sisa Pinj',
      ],
    ],
    body: tableRows,
    foot: footRows,
    theme: 'striped',
    margin: { left: marginX, right: marginX, bottom: 15 },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'left' },
      3: { halign: 'left' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
      11: { halign: 'right' },
      12: { halign: 'center' },
      13: { halign: 'center' },
      14: { halign: 'right' },
    },
  });

  // 5. Footer Dokumen (Waktu Cetak & Nomor Halaman)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Dicetak pada: ${printTimestamp}`, marginX, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  // 6. Simpan Dokumen jika autoSave
  const filename = `laporan-anggota-lengkap-${getFormattedToday()}.pdf`;
  if (autoSave && typeof document !== 'undefined') {
    doc.save(filename);
  }

  return doc;
}
