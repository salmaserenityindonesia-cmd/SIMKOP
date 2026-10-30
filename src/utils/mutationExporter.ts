/**
 * mutationExporter.ts
 * Utility ekspor data mutasi gudang dan kartu stok ke format Excel (.xlsx) dan PDF Landscape A4.
 *
 * Mendukung profil resmi koperasi, ringkasan KPI, metadata kartu stok produk,
 * format mata uang Rupiah, dan penataan kolom tabular yang profesional.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type ExcelJSType from 'exceljs';
import type {
  InventoryMutation,
  MutationFilter,
  MutationKPISummary,
  ProductStockLedger
} from '../services/inventoryMutationService';
import type { KoperasiProfile } from '../services/settingsService';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ExportMutationOptions {
  records: InventoryMutation[];
  kpi: MutationKPISummary;
  filters: MutationFilter;
  profile?: KoperasiProfile | null;
  productLedger?: ProductStockLedger | null;
  autoSave?: boolean;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

export const formatRp = (n: number = 0): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

export const formatMutationDate = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
};

/**
 * Normalizer to accept either options object or positional parameters
 */
function resolveExportOptions(
  optionsOrRecords: ExportMutationOptions | InventoryMutation[],
  argKpi?: MutationKPISummary,
  argFilters?: MutationFilter,
  argProfile?: KoperasiProfile | null,
  argProductLedger?: ProductStockLedger | null,
  argAutoSave: boolean = true
): ExportMutationOptions {
  if (Array.isArray(optionsOrRecords)) {
    return {
      records: optionsOrRecords,
      kpi: argKpi || {
        totalMasuk: 0,
        totalKeluar: 0,
        netPerubahan: 0,
        totalNilaiMasuk: 0,
        totalNilaiKeluar: 0,
        totalTransaksi: 0,
      },
      filters: argFilters || { startDate: '', endDate: '' },
      profile: argProfile,
      productLedger: argProductLedger,
      autoSave: argAutoSave,
    };
  }

  return {
    ...optionsOrRecords,
    autoSave: optionsOrRecords.autoSave ?? true,
  };
}

// ─── Excel Exporter ──────────────────────────────────────────────────────────

/**
 * Ekspor laporan mutasi barang dan kartu stok ke lembar kerja Excel (.xlsx)
 * Menggunakan dynamic import untuk ExcelJS guna efisiensi ukuran bundel frontend.
 */
export async function exportMutationToExcel(
  optionsOrRecords: ExportMutationOptions | InventoryMutation[],
  kpi?: MutationKPISummary,
  filters?: MutationFilter,
  profile?: KoperasiProfile | null,
  productLedger?: ProductStockLedger | null,
  autoSave: boolean = true
): Promise<ExcelJSType.Workbook> {
  const options = resolveExportOptions(
    optionsOrRecords,
    kpi,
    filters,
    profile,
    productLedger,
    autoSave
  );

  const { records, kpi: summaryKpi, filters: filterParams, profile: kopProfile, productLedger: ledger, autoSave: shouldSave } = options;

  const ExcelJS = (await import('exceljs')).default;
  const wb: ExcelJSType.Workbook = new ExcelJS.Workbook();
  wb.creator = 'SIMKOP Enterprise';
  wb.created = new Date();

  const sheetName = ledger ? 'Kartu Stok Gudang' : 'Mutasi Barang';
  const ws = wb.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // ── 1. Kop Koperasi ────────────────────────────────────────────────────────
  const namaKoperasi = (kopProfile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  const rowKoperasi = ws.addRow([namaKoperasi]);
  rowKoperasi.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F766E' } };

  const contactDetails = [
    kopProfile?.alamat,
    kopProfile?.telepon ? `Telp: ${kopProfile.telepon}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  if (contactDetails) {
    const rowContact = ws.addRow([contactDetails]);
    rowContact.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  }

  // Judul & Periode
  const titleText = ledger
    ? `KARTU STOK PRODUK / MUTASI GUDANG - ${ledger.productName.toUpperCase()}`
    : 'LAPORAN MUTASI BARANG GUDANG';
  const rowTitle = ws.addRow([titleText]);
  rowTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } };

  const periodText = `Periode: ${filterParams.startDate || '-'} s/d ${filterParams.endDate || '-'}`;
  const rowPeriod = ws.addRow([periodText]);
  rowPeriod.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };

  // Metadata Produk jika dalam mode Kartu Stok
  if (ledger) {
    const rowLedger = ws.addRow([
      `Kode/SKU: ${ledger.sku || '-'} | Satuan: ${ledger.unit || 'pcs'} | Saldo Awal: ${ledger.initialBalance} | Saldo Akhir: ${ledger.finalBalance} | Stok Saat Ini: ${ledger.currentStock}`,
    ]);
    rowLedger.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F766E' } };
  }

  ws.addRow([]); // Baris kosong pemisah

  // ── 2. Tabel Ringkasan KPI ─────────────────────────────────────────────────
  const kpiTitleRow = ws.addRow(['RINGKASAN MUTASI (KPI)']);
  kpiTitleRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F766E' } };

  const kpiRow1 = ws.addRow([
    'Total Masuk (+)',
    summaryKpi.totalMasuk,
    'Total Keluar (-)',
    summaryKpi.totalKeluar,
    'Net Perubahan',
    summaryKpi.netPerubahan,
  ]);
  kpiRow1.font = { name: 'Calibri', size: 9 };
  kpiRow1.getCell(1).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow1.getCell(3).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow1.getCell(5).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow1.getCell(2).numFmt = '#,##0';
  kpiRow1.getCell(4).numFmt = '#,##0';
  kpiRow1.getCell(6).numFmt = '#,##0';

  const kpiRow2 = ws.addRow([
    'Nilai Masuk',
    summaryKpi.totalNilaiMasuk,
    'Nilai Keluar',
    summaryKpi.totalNilaiKeluar,
    'Total Transaksi',
    summaryKpi.totalTransaksi,
  ]);
  kpiRow2.font = { name: 'Calibri', size: 9 };
  kpiRow2.getCell(1).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow2.getCell(3).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow2.getCell(5).font = { name: 'Calibri', size: 9, bold: true };
  kpiRow2.getCell(2).numFmt = '"Rp "#,##0';
  kpiRow2.getCell(4).numFmt = '"Rp "#,##0';
  kpiRow2.getCell(6).numFmt = '#,##0';

  ws.addRow([]); // Baris kosong pemisah

  // ── 3. Header Tabel Mutasi ─────────────────────────────────────────────────
  const headers = [
    'No',
    'Tanggal & Waktu',
    'No. Referensi',
    'SKU',
    'Nama Barang',
    'Jenis Mutasi',
    'Masuk (+)',
    'Keluar (-)',
    'Saldo Berjalan',
    'Harga Satuan (Rp)',
    'Catatan / Keterangan',
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 24;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal 700
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // ── 4. Baris Data Mutasi ───────────────────────────────────────────────────
  if (records.length === 0) {
    const emptyRow = ws.addRow([
      'Tidak ada transaksi mutasi inventori pada periode dan filter yang dipilih.',
    ]);
    emptyRow.font = { name: 'Calibri', size: 9, italic: true };
    emptyRow.alignment = { vertical: 'middle', horizontal: 'center' };
  } else {
    records.forEach((m, idx) => {
      const row = ws.addRow([
        idx + 1,
        formatMutationDate(m.mutation_date),
        m.reference_number || '-',
        m.sku || '-',
        m.product_name || '-',
        m.type_label || m.mutation_type,
        m.qty_in,
        m.qty_out,
        m.balance_after ?? '-',
        m.unit_price,
        m.notes || '-',
      ]);
      row.height = 20;
      row.font = { name: 'Calibri', size: 9 };

      // Formatting & Alignments
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };

      // Masuk (+)
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(7).numFmt = '#,##0';
      if (m.qty_in > 0) {
        row.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: 'FF047857' }, bold: true };
      }

      // Keluar (-)
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).numFmt = '#,##0';
      if (m.qty_out > 0) {
        row.getCell(8).font = { name: 'Calibri', size: 9, color: { argb: 'FFBE123C' }, bold: true };
      }

      // Saldo Berjalan
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      if (typeof m.balance_after === 'number') {
        row.getCell(9).numFmt = '#,##0';
        row.getCell(9).font = { name: 'Calibri', size: 9, bold: true };
      }

      // Harga Satuan
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(10).numFmt = '"Rp "#,##0';

      // Catatan
      row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle' };

      // Borders
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // ── 5. Baris Total / Footer Tabel ────────────────────────────────────────
    const totalRow = ws.addRow([
      'TOTAL MUTASI',
      '',
      '',
      '',
      '',
      '',
      summaryKpi.totalMasuk,
      summaryKpi.totalKeluar,
      ledger ? ledger.finalBalance : '',
      '',
      `Net Mutasi: ${summaryKpi.netPerubahan >= 0 ? '+' : ''}${summaryKpi.netPerubahan}`,
    ]);
    totalRow.height = 22;
    totalRow.font = { name: 'Calibri', size: 9, bold: true };

    totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(7).numFmt = '#,##0';
    totalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(8).numFmt = '#,##0';

    if (ledger) {
      totalRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(9).numFmt = '#,##0';
    }

    totalRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'double', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
  }

  // ── Column Widths ──────────────────────────────────────────────────────────
  ws.columns = [
    { width: 6 },  // No
    { width: 19 }, // Waktu & Tanggal
    { width: 20 }, // No. Referensi
    { width: 14 }, // SKU
    { width: 28 }, // Nama Barang
    { width: 22 }, // Jenis Mutasi
    { width: 13 }, // Masuk (+)
    { width: 13 }, // Keluar (-)
    { width: 15 }, // Saldo Berjalan
    { width: 18 }, // Harga Satuan
    { width: 34 }, // Catatan
  ];

  // ── Browser Download Trigger ───────────────────────────────────────────────
  const startDateStr = filterParams.startDate || 'awal';
  const endDateStr = filterParams.endDate || 'akhir';
  const filename = `laporan_mutasi_barang_${startDateStr}_${endDateStr}.xlsx`;

  if (shouldSave && typeof document !== 'undefined') {
    const buf = await wb.xlsx.writeBuffer();
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
    URL.revokeObjectURL(url);
  }

  return wb;
}

// ─── PDF Landscape Exporter ──────────────────────────────────────────────────

/**
 * Ekspor laporan mutasi barang dan kartu stok ke format cetak PDF Landscape A4
 * Menggunakan jsPDF & jspdf-autotable dengan kop resmi koperasi, kartu KPI, dan running balance.
 */
export async function exportMutationToPdf(
  optionsOrRecords: ExportMutationOptions | InventoryMutation[],
  kpi?: MutationKPISummary,
  filters?: MutationFilter,
  profile?: KoperasiProfile | null,
  productLedger?: ProductStockLedger | null,
  autoSave: boolean = true
): Promise<jsPDF> {
  const options = resolveExportOptions(
    optionsOrRecords,
    kpi,
    filters,
    profile,
    productLedger,
    autoSave
  );

  const { records, kpi: summaryKpi, filters: filterParams, profile: kopProfile, productLedger: ledger, autoSave: shouldSave } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // ── 1. Kop Koperasi & Judul ────────────────────────────────────────────────
  const namaKoperasi = (kopProfile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(namaKoperasi, marginX, 15);

  let currentY = 20;
  const contactDetails = [
    kopProfile?.alamat,
    kopProfile?.telepon ? `Telp: ${kopProfile.telepon}` : '',
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

  // Judul Laporan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 118, 110); // #0F766E teal-700
  const reportTitle = ledger
    ? `KARTU STOK PRODUK GUDANG - ${ledger.productName.toUpperCase()}`
    : 'LAPORAN MUTASI BARANG GUDANG';
  doc.text(reportTitle, marginX, currentY + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  const periodText = `Periode: ${filterParams.startDate || '-'} s/d ${filterParams.endDate || '-'}`;
  doc.text(periodText, marginX, currentY + 7);

  currentY += 10;

  // Divider Line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);
  currentY += 4;

  // Metadata Kartu Stok Produk jika ada
  if (ledger) {
    doc.setFillColor(240, 253, 250); // teal-50
    doc.setDrawColor(153, 246, 228); // teal-200
    doc.roundedRect(marginX, currentY, pageWidth - marginX * 2, 7.5, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 118, 110);
    const ledgerDetails = `KARTU STOK: [${ledger.sku || '-'}] ${ledger.productName} | Satuan: ${ledger.unit || 'pcs'} | Saldo Awal: ${ledger.initialBalance} | Saldo Akhir: ${ledger.finalBalance} | Stok Fisik: ${ledger.currentStock}`;
    doc.text(ledgerDetails, marginX + 3, currentY + 5);
    currentY += 10.5;
  }

  // ── 2. Ringkasan KPI Cards (6 Kolom Presisi) ──────────────────────────────
  const cardWidth = 41.5;
  const cardHeight = 12.5;
  const cardGap = 4;
  const kpiCards = [
    { label: 'TOTAL MASUK (+)', value: `+${summaryKpi.totalMasuk.toLocaleString('id-ID')}` },
    { label: 'TOTAL KELUAR (-)', value: `-${summaryKpi.totalKeluar.toLocaleString('id-ID')}` },
    {
      label: 'NET PERUBAHAN',
      value: `${summaryKpi.netPerubahan >= 0 ? '+' : ''}${summaryKpi.netPerubahan.toLocaleString('id-ID')}`,
    },
    { label: 'NILAI MASUK', value: formatRp(summaryKpi.totalNilaiMasuk) },
    { label: 'NILAI KELUAR', value: formatRp(summaryKpi.totalNilaiKeluar) },
    { label: 'TRANSAKSI', value: `${summaryKpi.totalTransaksi}` },
  ];

  kpiCards.forEach((card, idx) => {
    const cardX = marginX + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.25);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(card.label, cardX + 3, currentY + 4.2);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(card.value, cardX + 3, currentY + 9.5);
  });

  currentY += cardHeight + 5;

  // ── 3. Tabel Detail Mutasi via autoTable ────────────────────────────────────
  const hasData = records.length > 0;
  const tableRows: any[] = hasData
    ? records.map((m, idx) => [
        idx + 1,
        formatMutationDate(m.mutation_date),
        m.reference_number || '-',
        m.sku || '-',
        m.product_name || '-',
        m.type_label || m.mutation_type,
        m.qty_in > 0 ? `+${m.qty_in}` : '-',
        m.qty_out > 0 ? `-${m.qty_out}` : '-',
        m.balance_after !== undefined && m.balance_after !== null ? `${m.balance_after}` : '-',
        m.unit_price > 0 ? formatRp(m.unit_price) : '-',
        m.notes || '-',
      ])
    : [
        [
          {
            content: 'Tidak ada data transaksi mutasi inventori pada periode ini',
            colSpan: 11,
            styles: { halign: 'center' as const, fontStyle: 'italic' as const },
          },
        ],
      ];

  const footRows: any[] | undefined = hasData
    ? [
        [
          {
            content: 'TOTAL MUTASI',
            colSpan: 6,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: `+${summaryKpi.totalMasuk.toLocaleString('id-ID')}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [4, 120, 87] },
          },
          {
            content: `-${summaryKpi.totalKeluar.toLocaleString('id-ID')}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [190, 18, 60] },
          },
          {
            content: ledger ? `${ledger.finalBalance.toLocaleString('id-ID')}` : '-',
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: '-',
            styles: { halign: 'center' as const },
          },
          {
            content: `Net: ${summaryKpi.netPerubahan >= 0 ? '+' : ''}${summaryKpi.netPerubahan.toLocaleString('id-ID')}`,
            styles: { fontStyle: 'bold' as const },
          },
        ],
      ]
    : undefined;

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'NO',
        'WAKTU',
        'NO. REF',
        'SKU',
        'NAMA BARANG',
        'JENIS MUTASI',
        'MASUK',
        'KELUAR',
        'SALDO',
        'HARGA',
        'KETERANGAN',
      ],
    ],
    body: tableRows,
    foot: footRows,
    theme: 'striped',
    margin: { left: marginX, right: marginX, bottom: 16 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 118, 110], // #0F766E Teal-700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 26, halign: 'left' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 44, halign: 'left' },
      5: { cellWidth: 30, halign: 'left' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 27, halign: 'right' },
      10: { cellWidth: 38, halign: 'left' },
    },
  });

  // ── 4. Footer Dokumen (Waktu Cetak & Nomor Halaman) ──────────────────────────
  const totalPages = doc.getNumberOfPages();
  const printTimestamp = new Date().toLocaleString('id-ID');

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Dicetak pada: ${printTimestamp} | SIMKOP Inventory System`, marginX, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  // ── 5. Simpan Dokumen jika autoSave diaktifkan ──────────────────────────────
  const startDateStr = filterParams.startDate || 'awal';
  const endDateStr = filterParams.endDate || 'akhir';
  const pdfFilename = `laporan_mutasi_barang_${startDateStr}_${endDateStr}.pdf`;

  if (shouldSave) {
    doc.save(pdfFilename);
  }

  return doc;
}
